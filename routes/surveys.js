// routes/surveys.js — Anketler (anket.html)
const router = require('express').Router();
const db = require('../config/db');

const currentUserId = (req) => req.session.userId || process.env.DEMO_USER_ID || 1;

// Anket listesi (kullanıcıya özel — tamamladıkları işaretli)
router.get('/', async (req, res) => {
  try {
    const uid = currentUserId(req);
    const [rows] = await db.query(`
      SELECT s.id, s.title, s.subtitle, s.description, s.estimated_minutes,
             s.reward_type, s.reward_amount, s.status,
             u.full_name AS employer_name, u.avatar_url AS employer_avatar,
             (SELECT COUNT(*) FROM survey_questions WHERE survey_id = s.id) AS question_count,
             EXISTS(SELECT 1 FROM survey_responses sr WHERE sr.survey_id = s.id AND sr.user_id = ?) AS is_completed
      FROM surveys s
      JOIN users u ON u.id = s.employer_id
      WHERE s.status = 'active'
      ORDER BY s.created_at DESC`, [uid]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Anket detayı + soruları + seçenekleri
router.get('/:id', async (req, res) => {
  try {
    const [surveys] = await db.query(`
      SELECT s.*, u.full_name AS employer_name
      FROM surveys s JOIN users u ON u.id = s.employer_id
      WHERE s.id = ?`, [req.params.id]);
    if (surveys.length === 0) return res.status(404).json({ error: 'Anket yok' });

    const [questions] = await db.query(`
      SELECT id, question_text, question_type, is_required, sort_order
      FROM survey_questions WHERE survey_id = ?
      ORDER BY sort_order`, [req.params.id]);

    for (const q of questions) {
      const [opts] = await db.query(`
        SELECT id, option_text, sort_order
        FROM survey_options WHERE question_id = ?
        ORDER BY sort_order`, [q.id]);
      q.options = opts;
    }

    res.json({ survey: surveys[0], questions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Anket gönder
router.post('/:id/submit', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const uid = currentUserId(req);
    const { answers } = req.body; // [{question_id, option_id?, text_answer?, rating_value?}]

    const [r] = await conn.query(
      `INSERT INTO survey_responses (survey_id, user_id) VALUES (?, ?)`,
      [req.params.id, uid]
    );
    const responseId = r.insertId;

    for (const a of answers || []) {
      await conn.query(`
        INSERT INTO survey_answers (response_id, question_id, option_id, text_answer, rating_value)
        VALUES (?, ?, ?, ?, ?)`,
        [responseId, a.question_id, a.option_id || null, a.text_answer || null, a.rating_value || null]
      );
    }

    // Ödülü hesapla
    const [s] = await conn.query('SELECT reward_type, reward_amount FROM surveys WHERE id = ?', [req.params.id]);
    if (s[0] && s[0].reward_type === 'balance' && s[0].reward_amount > 0) {
      await conn.query('UPDATE users SET pending_balance = pending_balance + ? WHERE id = ?',
        [s[0].reward_amount, uid]);
    } else if (s[0] && s[0].reward_type === 'points' && s[0].reward_amount > 0) {
      await conn.query('UPDATE users SET profile_score = profile_score + ? WHERE id = ?',
        [s[0].reward_amount, uid]);
    }
    await conn.query('UPDATE survey_responses SET reward_granted = 1 WHERE id = ?', [responseId]);

    await conn.commit();
    res.json({ success: true, reward: s[0] });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Bu ankete zaten cevap verdin' });
    }
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;

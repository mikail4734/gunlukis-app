// routes/surveys.js — Anketler (anket.html + zorunlu anket sistemi)
const router = require('express').Router();
const db = require('../config/db');

const currentUserId = (req) => req.session.userId || process.env.DEMO_USER_ID || 1;

// ═══════════════════════════════════════════════════════════════════════════
// ANKET LİSTESİ (kullanıcıya özel — tamamladıkları işaretli)
// ═══════════════════════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  try {
    const uid = currentUserId(req);
    const [rows] = await db.query(`
      SELECT s.id, s.title, s.subtitle, s.description, s.estimated_minutes,
             s.reward_type, s.reward_amount, s.status, s.is_mandatory,
             s.created_at,
             u.full_name AS employer_name, u.avatar_url AS employer_avatar,
             (SELECT COUNT(*) FROM survey_questions WHERE survey_id = s.id) AS question_count,
             (SELECT COUNT(*) FROM survey_responses WHERE survey_id = s.id) AS response_count,
             EXISTS(SELECT 1 FROM survey_responses sr WHERE sr.survey_id = s.id AND sr.user_id = ?) AS is_completed
      FROM surveys s
      JOIN users u ON u.id = s.employer_id
      WHERE s.status = 'active'
      ORDER BY s.is_mandatory DESC, s.created_at DESC`, [uid]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// KULLANICI ANKETLİ KAZANÇ İSTATİSTİKLERİ
// ═══════════════════════════════════════════════════════════════════════════
router.get('/me/stats', async (req, res) => {
  try {
    const uid = currentUserId(req);
    const [[done]] = await db.query(
      'SELECT COUNT(*) AS cnt FROM survey_responses WHERE user_id = ?', [uid]
    );
    const [[earned]] = await db.query(`
      SELECT COALESCE(SUM(s.reward_amount), 0) AS total
      FROM survey_responses sr
      JOIN surveys s ON s.id = sr.survey_id
      WHERE sr.user_id = ? AND sr.reward_granted = 1 AND s.reward_type = 'balance'`,
      [uid]
    );
    const [[avail]] = await db.query(`
      SELECT COUNT(*) AS cnt FROM surveys s
      WHERE s.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM survey_responses sr WHERE sr.survey_id = s.id AND sr.user_id = ?)`,
      [uid]
    );

    res.json({
      completed: done.cnt,
      total_earned: parseFloat(earned.total),
      available: avail.cnt
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ZORUNLU ANKET KONTROLÜ
// 30 dk sonra çağrılır. Tamamlanmamış ZORUNLU bir anket varsa onu döndürür.
// ═══════════════════════════════════════════════════════════════════════════
router.get('/mandatory/check', async (req, res) => {
  try {
    const uid = currentUserId(req);
    const [rows] = await db.query(`
      SELECT s.id, s.title, s.subtitle, s.estimated_minutes, s.reward_amount, s.reward_type
      FROM surveys s
      WHERE s.status = 'active' AND s.is_mandatory = 1
      AND NOT EXISTS (SELECT 1 FROM survey_responses sr WHERE sr.survey_id = s.id AND sr.user_id = ?)
      ORDER BY s.created_at ASC
      LIMIT 1`, [uid]
    );
    if (rows.length === 0) return res.json({ mandatory: null });
    res.json({ mandatory: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ANKET DETAYI (sorular + seçenekler)
// ═══════════════════════════════════════════════════════════════════════════
router.get('/:id', async (req, res) => {
  try {
    const [surveys] = await db.query(`
      SELECT s.*, u.full_name AS employer_name, u.avatar_url AS employer_avatar
      FROM surveys s JOIN users u ON u.id = s.employer_id
      WHERE s.id = ?`, [req.params.id]);
    if (surveys.length === 0) return res.status(404).json({ error: 'Anket yok' });

    const [questions] = await db.query(`
      SELECT id, question_text, question_type, is_required, sort_order
      FROM survey_questions WHERE survey_id = ?
      ORDER BY sort_order, id`, [req.params.id]);

    for (const q of questions) {
      const [opts] = await db.query(`
        SELECT id, option_text, sort_order
        FROM survey_options WHERE question_id = ?
        ORDER BY sort_order, id`, [q.id]);
      q.options = opts;
    }

    res.json({ survey: surveys[0], questions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ANKET CEVABI GÖNDER (+ ödül hesapla)
// ═══════════════════════════════════════════════════════════════════════════
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
    let reward = { amount: 0, type: 'none' };
    if (s[0] && s[0].reward_type === 'balance' && s[0].reward_amount > 0) {
      await conn.query('UPDATE users SET pending_balance = pending_balance + ? WHERE id = ?',
        [s[0].reward_amount, uid]);
      reward = { amount: parseFloat(s[0].reward_amount), type: 'balance' };
    } else if (s[0] && s[0].reward_type === 'points' && s[0].reward_amount > 0) {
      try {
        await conn.query('UPDATE users SET profile_score = profile_score + ? WHERE id = ?',
          [s[0].reward_amount, uid]);
      } catch (e) { /* profile_score kolonu yoksa sessizce geç */ }
      reward = { amount: parseFloat(s[0].reward_amount), type: 'points' };
    }
    await conn.query('UPDATE survey_responses SET reward_granted = 1 WHERE id = ?', [responseId]);

    await conn.commit();
    res.json({ success: true, reward });
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

// ═══════════════════════════════════════════════════════════════════════════
// YENİ ANKET OLUŞTUR (anket-olustur.html)
// ═══════════════════════════════════════════════════════════════════════════
router.post('/', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const uid = currentUserId(req);
    const {
      title, subtitle, description, estimated_minutes,
      reward_type, reward_amount, is_mandatory,
      questions  // [{ question_text, question_type, is_required, options: ['A','B','C'] }]
    } = req.body;

    if (!title || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: 'Başlık ve en az 1 soru zorunludur' });
    }

    const [r] = await conn.query(`
      INSERT INTO surveys
        (employer_id, title, subtitle, description, estimated_minutes,
         reward_type, reward_amount, is_mandatory, status, starts_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW())`,
      [
        uid, title.trim(), subtitle || null, description || null,
        estimated_minutes || null,
        reward_type || 'none',
        reward_amount || null,
        is_mandatory ? 1 : 0
      ]
    );
    const surveyId = r.insertId;

    let sortOrder = 0;
    for (const q of questions) {
      if (!q.question_text) continue;
      const [qr] = await conn.query(`
        INSERT INTO survey_questions (survey_id, question_text, question_type, is_required, sort_order)
        VALUES (?, ?, ?, ?, ?)`,
        [
          surveyId, q.question_text.trim(),
          q.question_type || 'single_choice',
          q.is_required === false ? 0 : 1,
          sortOrder++
        ]
      );
      const questionId = qr.insertId;

      if (Array.isArray(q.options)) {
        let optOrder = 0;
        for (const opt of q.options) {
          if (!opt || !opt.trim()) continue;
          await conn.query(`
            INSERT INTO survey_options (question_id, option_text, sort_order)
            VALUES (?, ?, ?)`,
            [questionId, opt.trim(), optOrder++]
          );
        }
      }
    }

    await conn.commit();
    res.json({ success: true, id: surveyId });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;

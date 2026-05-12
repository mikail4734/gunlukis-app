// routes/calendar.js — Takvim (takvim.html)
const router = require('express').Router();
const db = require('../config/db');

const currentUserId = (req) => req.session.userId || process.env.DEMO_USER_ID || 1;

// Bir ay için olay listesi
router.get('/events', async (req, res) => {
  try {
    const uid = currentUserId(req);
    const { year, month } = req.query; // 1-12

    let sql = `
      SELECT id, job_id, title, note, event_date, start_time, end_time, color, source, is_blocked
      FROM calendar_events
      WHERE user_id = ?`;
    const params = [uid];

    if (year && month) {
      sql += ' AND YEAR(event_date) = ? AND MONTH(event_date) = ?';
      params.push(year, month);
    }
    sql += ' ORDER BY event_date ASC, start_time ASC';

    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Yaklaşan olaylar (sağ kenarda)
router.get('/upcoming', async (req, res) => {
  try {
    const uid = currentUserId(req);
    const [rows] = await db.query(`
      SELECT id, job_id, title, event_date, start_time, color
      FROM calendar_events
      WHERE user_id = ? AND event_date >= CURDATE()
      ORDER BY event_date ASC, start_time ASC
      LIMIT 5`, [uid]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bekleyen onaylar (kabul edilmiş ama takvime henüz eklenmemiş başvurular)
router.get('/pending-approvals', async (req, res) => {
  try {
    const uid = currentUserId(req);
    const [rows] = await db.query(`
      SELECT a.id AS application_id, j.id AS job_id, j.title, j.work_date, j.start_time,
             j.budget, j.city, j.district,
             u.full_name AS employer_name
      FROM applications a
      JOIN jobs j  ON j.id = a.job_id
      JOIN users u ON u.id = j.employer_id
      WHERE a.worker_id = ? AND a.status = 'accepted'
        AND NOT EXISTS (SELECT 1 FROM calendar_events e WHERE e.user_id = ? AND e.job_id = j.id)
      ORDER BY j.work_date ASC`,
      [uid, uid]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Yeni takvim olayı ekle (manuel)
router.post('/events', async (req, res) => {
  try {
    const uid = currentUserId(req);
    const { title, note, event_date, start_time, end_time, color, job_id } = req.body;
    if (!title || !event_date) {
      return res.status(400).json({ error: 'title ve event_date zorunlu' });
    }
    const [result] = await db.query(`
      INSERT INTO calendar_events (user_id, job_id, title, note, event_date, start_time, end_time, color, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uid, job_id || null, title, note || null, event_date,
       start_time || null, end_time || null, color || 'slate',
       job_id ? 'job' : 'manual']
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Olay sil
router.delete('/events/:id', async (req, res) => {
  try {
    const uid = currentUserId(req);
    await db.query('DELETE FROM calendar_events WHERE id = ? AND user_id = ?', [req.params.id, uid]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

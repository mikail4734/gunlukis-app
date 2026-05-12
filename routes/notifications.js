// routes/notifications.js — Bildirimler (çan ikonu paneli)
const router = require('express').Router();
const db = require('../config/db');

const currentUserId = (req) => req.session.userId || process.env.DEMO_USER_ID || 1;

// Tüm bildirimler (en yeni üstte)
router.get('/', async (req, res) => {
  try {
    const uid = currentUserId(req);
    const [rows] = await db.query(
      `SELECT id, type, title, body, link_url, is_read, created_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 30`,
      [uid]
    );
    const [[{ unread }]] = await db.query(
      'SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND is_read = 0',
      [uid]
    );
    res.json({ items: rows, unread });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Tek bildirimi okundu işaretle
router.put('/:id/read', async (req, res) => {
  try {
    const uid = currentUserId(req);
    await db.query(
      'UPDATE notifications SET is_read = 1, read_at = NOW() WHERE id = ? AND user_id = ?',
      [req.params.id, uid]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Hepsini okundu işaretle
router.put('/read-all', async (req, res) => {
  try {
    const uid = currentUserId(req);
    await db.query(
      'UPDATE notifications SET is_read = 1, read_at = NOW() WHERE user_id = ? AND is_read = 0',
      [uid]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bildirim sil
router.delete('/:id', async (req, res) => {
  try {
    const uid = currentUserId(req);
    await db.query(
      'DELETE FROM notifications WHERE id = ? AND user_id = ?',
      [req.params.id, uid]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// routes/auth.js — Giriş / Kayıt / Çıkış
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');

// Kayıt
router.post('/register', async (req, res) => {
  try {
    const { full_name, email, password, phone, role } = req.body;
    if (!full_name || !email || !password) {
      return res.status(400).json({ error: 'Eksik alan var' });
    }
    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      `INSERT INTO users (full_name, email, password_hash, phone, role)
       VALUES (?, ?, ?, ?, ?)`,
      [full_name, email, hash, phone || null, role || 'worker']
    );
    req.session.userId = result.insertId;
    res.json({ success: true, user_id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Bu e-posta zaten kayıtlı' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Giriş
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Hatalı e-posta veya şifre' });
    }
    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Hatalı e-posta veya şifre' });
    }
    req.session.userId = user.id;
    await db.query('UPDATE users SET is_online = 1, last_seen_at = NOW() WHERE id = ?', [user.id]);
    res.json({
      success: true,
      user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role, avatar_url: user.avatar_url }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Çıkış
router.post('/logout', async (req, res) => {
  if (req.session.userId) {
    await db.query('UPDATE users SET is_online = 0 WHERE id = ?', [req.session.userId]);
  }
  req.session.destroy(() => res.json({ success: true }));
});

// Mevcut kullanıcı (header'da profil bilgileri için)
router.get('/me', async (req, res) => {
  try {
    const uid = req.session.userId || process.env.DEMO_USER_ID || 1;
    const [rows] = await db.query(
      `SELECT id, full_name, email, phone, role, title, avatar_url, city, district,
              rating_avg, rating_count, total_earnings, pending_balance
       FROM users WHERE id = ?`, [uid]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Kullanıcı yok' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

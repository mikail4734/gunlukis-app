// routes/profile.js — Profil sayfası (profil.html)
const router = require('express').Router();
const db = require('../config/db');

const currentUserId = (req) => req.session.userId || process.env.DEMO_USER_ID || 1;

// Profil bilgileri (tüm sekmeler dahil)
router.get('/:id?', async (req, res) => {
  try {
    const uid = req.params.id || currentUserId(req);

    const [users] = await db.query(`
      SELECT id, full_name, email, phone, title, bio, avatar_url, city, district,
             rating_avg, rating_count, total_earnings, pending_balance, is_verified, is_online
      FROM users WHERE id = ?`, [uid]
    );
    if (users.length === 0) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });

    // Yetenekler
    const [skills] = await db.query(`
      SELECT s.id, s.name, us.level
      FROM user_skills us JOIN skills s ON s.id = us.skill_id
      WHERE us.user_id = ?`, [uid]);

    // Tercih edilen iş alanları
    const [prefs] = await db.query(`
      SELECT p.id, p.work_type, p.note, c.name AS category_name, c.icon AS category_icon
      FROM user_preferences p JOIN categories c ON c.id = p.category_id
      WHERE p.user_id = ?`, [uid]);

    // İş geçmişi
    const [history] = await db.query(`
      SELECT id, company_name, position_title, description, start_date, end_date,
             earnings, employer_rating, is_paid
      FROM work_history
      WHERE user_id = ?
      ORDER BY start_date DESC`, [uid]);

    // Değerlendirmeler (gelen yorumlar)
    const [reviews] = await db.query(`
      SELECT r.id, r.rating, r.comment, r.created_at,
             u.full_name AS reviewer_name, u.avatar_url AS reviewer_avatar
      FROM reviews r JOIN users u ON u.id = r.reviewer_id
      WHERE r.reviewee_id = ?
      ORDER BY r.created_at DESC`, [uid]);

    res.json({ user: users[0], skills, preferences: prefs, history, reviews });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Profili güncelle
router.put('/', async (req, res) => {
  try {
    const uid = currentUserId(req);
    const { full_name, title, bio, city, district, phone } = req.body;
    await db.query(`
      UPDATE users
      SET full_name = COALESCE(?, full_name),
          title    = COALESCE(?, title),
          bio      = COALESCE(?, bio),
          city     = COALESCE(?, city),
          district = COALESCE(?, district),
          phone    = COALESCE(?, phone)
      WHERE id = ?`,
      [full_name, title, bio, city, district, phone, uid]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

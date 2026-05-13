// routes/social.js — Takip et / Konuşma başlat
const router = require('express').Router();
const db = require('../config/db');

const currentUserId = (req) => req.session.userId || process.env.DEMO_USER_ID || 1;

// ═══════════════════════════════════════════════════════════════════════════
// TAKİP ET / TAKİBİ BIRAK (toggle)
// ═══════════════════════════════════════════════════════════════════════════
router.post('/follow/:userId', async (req, res) => {
  try {
    const me = currentUserId(req);
    const target = Number(req.params.userId);

    if (me === target) return res.status(400).json({ error: 'Kendini takip edemezsin' });

    const [existing] = await db.query(
      'SELECT 1 FROM follows WHERE follower_id = ? AND followed_id = ?',
      [me, target]
    );

    if (existing.length > 0) {
      await db.query(
        'DELETE FROM follows WHERE follower_id = ? AND followed_id = ?',
        [me, target]
      );
      return res.json({ following: false });
    }

    await db.query(
      'INSERT INTO follows (follower_id, followed_id) VALUES (?, ?)',
      [me, target]
    );
    res.json({ following: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TAKİP ETTİKLERİM (mesaj.html "Gruplar" sekmesi için)
// ═══════════════════════════════════════════════════════════════════════════
router.get('/following', async (req, res) => {
  try {
    const me = currentUserId(req);
    const [rows] = await db.query(`
      SELECT u.id, u.full_name, u.avatar_url, u.title, u.is_online, u.rating_avg, u.is_verified,
             f.created_at AS followed_at
      FROM follows f
      JOIN users u ON u.id = f.followed_id
      WHERE f.follower_id = ?
      ORDER BY f.created_at DESC`, [me]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TAKİPÇİLERİM
// ═══════════════════════════════════════════════════════════════════════════
router.get('/followers', async (req, res) => {
  try {
    const me = currentUserId(req);
    const [rows] = await db.query(`
      SELECT u.id, u.full_name, u.avatar_url, u.title, u.is_online,
             f.created_at AS followed_at
      FROM follows f
      JOIN users u ON u.id = f.follower_id
      WHERE f.followed_id = ?
      ORDER BY f.created_at DESC`, [me]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// KONUŞMA BAŞLAT (Soru Sor butonu için)
// Eğer iki kullanıcı arasında konuşma varsa onu döndürür, yoksa oluşturur.
// ═══════════════════════════════════════════════════════════════════════════
router.post('/conversations/start', async (req, res) => {
  try {
    const me = currentUserId(req);
    const { target_user_id, job_id } = req.body;
    const target = Number(target_user_id);

    if (!target) return res.status(400).json({ error: 'target_user_id gerekli' });
    if (target === me) return res.status(400).json({ error: 'Kendinle sohbet başlatamazsın' });

    // 1) Bu iki kullanıcı arasında mevcut bir 1-1 konuşma var mı? (conversation_participants ile bul)
    const [existing] = await db.query(`
      SELECT c.id
      FROM conversations c
      JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = ?
      JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = ?
      WHERE (c.is_group IS NULL OR c.is_group = 0)
      LIMIT 1`,
      [me, target]
    );

    if (existing.length > 0) {
      return res.json({ conversation_id: existing[0].id, created: false });
    }

    // 2) Yeni konuşma oluştur
    const [result] = await db.query(`
      INSERT INTO conversations (is_group, user1_id, user2_id, job_id, last_message_at)
      VALUES (0, ?, ?, ?, NOW())`,
      [me, target, job_id || null]
    );

    const convId = result.insertId;

    // 3) Katılımcıları conversation_participants tablosuna ekle
    await db.query(
      `INSERT INTO conversation_participants (conversation_id, user_id, role)
       VALUES (?, ?, 'member'), (?, ?, 'member')`,
      [convId, me, convId, target]
    );

    res.json({ conversation_id: convId, created: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

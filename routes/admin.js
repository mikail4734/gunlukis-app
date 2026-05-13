// routes/admin.js — Sadece adminlerin erişebildiği yönetim paneli
const router = require('express').Router();
const db = require('../config/db');

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN MIDDLEWARE — bu router'daki TÜM endpoint'ler admin gerektirir
// ═══════════════════════════════════════════════════════════════════════════
router.use(async (req, res, next) => {
  const uid = req.session.userId;
  if (!uid) return res.status(401).json({ error: 'Giriş yapılmamış' });

  try {
    const [rows] = await db.query('SELECT is_admin FROM users WHERE id = ?', [uid]);
    if (rows.length === 0 || !rows[0].is_admin) {
      return res.status(403).json({ error: 'Yetkiniz yok — admin değilsiniz' });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD — Genel istatistikler
// ═══════════════════════════════════════════════════════════════════════════
router.get('/dashboard', async (req, res) => {
  try {
    const [[users]]    = await db.query('SELECT COUNT(*) AS cnt FROM users WHERE status="active"');
    const [[banned]]   = await db.query('SELECT COUNT(*) AS cnt FROM users WHERE is_banned=1');
    const [[admins]]   = await db.query('SELECT COUNT(*) AS cnt FROM users WHERE is_admin=1');
    const [[jobs]]     = await db.query('SELECT COUNT(*) AS cnt FROM jobs WHERE status="published"');
    const [[jobsAll]]  = await db.query('SELECT COUNT(*) AS cnt FROM jobs');
    const [[surveys]]  = await db.query('SELECT COUNT(*) AS cnt FROM surveys WHERE status="active"');
    const [[apps]]     = await db.query('SELECT COUNT(*) AS cnt FROM applications');
    const [[totalSurveyReward]] = await db.query(`
      SELECT COALESCE(SUM(s.reward_amount), 0) AS total
      FROM survey_responses sr JOIN surveys s ON s.id = sr.survey_id
      WHERE sr.reward_granted = 1 AND s.reward_type = 'balance'`);
    const [[totalBudget]] = await db.query('SELECT COALESCE(SUM(budget), 0) AS total FROM jobs WHERE status IN ("published","completed")');
    const [[newToday]] = await db.query('SELECT COUNT(*) AS cnt FROM users WHERE DATE(created_at) = CURDATE()');
    const [[newJobsToday]] = await db.query('SELECT COUNT(*) AS cnt FROM jobs WHERE DATE(published_at) = CURDATE()');

    res.json({
      users:           users.cnt,
      banned:          banned.cnt,
      admins:          admins.cnt,
      active_jobs:     jobs.cnt,
      total_jobs:      jobsAll.cnt,
      active_surveys:  surveys.cnt,
      applications:    apps.cnt,
      total_survey_rewards: parseFloat(totalSurveyReward.total),
      total_job_budget:     parseFloat(totalBudget.total),
      new_users_today: newToday.cnt,
      new_jobs_today:  newJobsToday.cnt,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// KULLANICILAR — Listele (puanlar dahil)
// ═══════════════════════════════════════════════════════════════════════════
router.get('/users', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const filter = req.query.filter || 'all'; // all, banned, admin

    let sql = `
      SELECT id, full_name, email, phone, role, is_admin, is_banned, ban_reason,
             title, avatar_url, city, district, is_verified, is_online,
             rating_avg, rating_count, total_earnings, pending_balance,
             profile_score, status, created_at, last_seen_at,
             (SELECT COUNT(*) FROM jobs WHERE employer_id = users.id) AS jobs_count,
             (SELECT COUNT(*) FROM applications WHERE worker_id = users.id) AS applications_count,
             (SELECT COUNT(*) FROM survey_responses WHERE user_id = users.id) AS surveys_completed
      FROM users WHERE 1=1`;
    const params = [];

    if (q) {
      sql += ' AND (full_name LIKE ? OR email LIKE ?)';
      params.push('%' + q + '%', '%' + q + '%');
    }
    if (filter === 'banned')  sql += ' AND is_banned = 1';
    if (filter === 'admin')   sql += ' AND is_admin = 1';
    if (filter === 'online')  sql += ' AND is_online = 1';

    sql += ' ORDER BY created_at DESC LIMIT 200';
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// KULLANICI YASAKLA / KALDIR
// ═══════════════════════════════════════════════════════════════════════════
router.post('/users/:id/ban', async (req, res) => {
  try {
    const me = req.session.userId;
    const targetId = Number(req.params.id);
    if (me === targetId) return res.status(400).json({ error: 'Kendini banlayamazsın' });

    const { reason } = req.body;
    await db.query(
      'UPDATE users SET is_banned = 1, ban_reason = ?, banned_at = NOW() WHERE id = ?',
      [reason || 'Kural ihlali', targetId]
    );
    res.json({ success: true, banned: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/users/:id/unban', async (req, res) => {
  try {
    await db.query(
      'UPDATE users SET is_banned = 0, ban_reason = NULL, banned_at = NULL WHERE id = ?',
      [req.params.id]
    );
    res.json({ success: true, banned: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin yetkisi ver / al
router.post('/users/:id/toggle-admin', async (req, res) => {
  try {
    const me = req.session.userId;
    const targetId = Number(req.params.id);
    if (me === targetId) return res.status(400).json({ error: 'Kendi admin yetkini değiştiremezsin' });

    const [rows] = await db.query('SELECT is_admin FROM users WHERE id = ?', [targetId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Kullanıcı yok' });

    const newValue = rows[0].is_admin ? 0 : 1;
    await db.query('UPDATE users SET is_admin = ? WHERE id = ?', [newValue, targetId]);
    res.json({ success: true, is_admin: newValue === 1 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Kullanıcı sil (kalıcı)
router.delete('/users/:id', async (req, res) => {
  try {
    const me = req.session.userId;
    const targetId = Number(req.params.id);
    if (me === targetId) return res.status(400).json({ error: 'Kendini silemezsin' });
    await db.query('DELETE FROM users WHERE id = ?', [targetId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// İLANLAR
// ═══════════════════════════════════════════════════════════════════════════
router.get('/jobs', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    let sql = `
      SELECT j.id, j.title, j.budget, j.work_date, j.city, j.district,
             j.status, j.view_count, j.applicant_count, j.published_at,
             u.id AS employer_id, u.full_name AS employer_name, u.avatar_url AS employer_avatar,
             c.name AS category_name
      FROM jobs j
      JOIN users u ON u.id = j.employer_id
      JOIN categories c ON c.id = j.category_id
      WHERE 1=1`;
    const params = [];
    if (q) {
      sql += ' AND (j.title LIKE ? OR u.full_name LIKE ?)';
      params.push('%' + q + '%', '%' + q + '%');
    }
    sql += ' ORDER BY j.published_at DESC LIMIT 200';
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/jobs/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM jobs WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ANKETLER
// ═══════════════════════════════════════════════════════════════════════════
router.get('/surveys', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    let sql = `
      SELECT s.id, s.title, s.subtitle, s.reward_type, s.reward_amount,
             s.status, s.is_mandatory, s.created_at,
             u.id AS employer_id, u.full_name AS employer_name, u.avatar_url AS employer_avatar,
             (SELECT COUNT(*) FROM survey_questions WHERE survey_id = s.id) AS question_count,
             (SELECT COUNT(*) FROM survey_responses WHERE survey_id = s.id) AS response_count
      FROM surveys s
      JOIN users u ON u.id = s.employer_id
      WHERE 1=1`;
    const params = [];
    if (q) {
      sql += ' AND (s.title LIKE ? OR u.full_name LIKE ?)';
      params.push('%' + q + '%', '%' + q + '%');
    }
    sql += ' ORDER BY s.created_at DESC LIMIT 200';
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/surveys/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM surveys WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/surveys/:id/toggle-mandatory', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT is_mandatory FROM surveys WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Anket yok' });
    const newValue = rows[0].is_mandatory ? 0 : 1;
    await db.query('UPDATE surveys SET is_mandatory = ? WHERE id = ?', [newValue, req.params.id]);
    res.json({ success: true, is_mandatory: newValue === 1 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PUANLAR (sadece adminin görebileceği)
// ═══════════════════════════════════════════════════════════════════════════
router.get('/scores', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT id, full_name, email, avatar_url, role,
             rating_avg, rating_count,
             total_earnings, pending_balance, profile_score,
             (SELECT COUNT(*) FROM jobs WHERE employer_id = users.id) AS jobs_count,
             (SELECT COUNT(*) FROM applications WHERE worker_id = users.id AND status = 'completed') AS completed_jobs,
             (SELECT COUNT(*) FROM survey_responses WHERE user_id = users.id) AS surveys_done,
             is_banned, is_admin
      FROM users
      WHERE status = 'active'
      ORDER BY rating_avg DESC, rating_count DESC, total_earnings DESC
      LIMIT 200`);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// BAŞVURULAR
// ═══════════════════════════════════════════════════════════════════════════
router.get('/applications', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT a.id, a.status, a.applied_at, a.cover_message,
             j.id AS job_id, j.title AS job_title, j.budget,
             w.id AS worker_id, w.full_name AS worker_name, w.avatar_url AS worker_avatar,
             e.id AS employer_id, e.full_name AS employer_name
      FROM applications a
      JOIN jobs j ON j.id = a.job_id
      JOIN users w ON w.id = a.worker_id
      JOIN users e ON e.id = j.employer_id
      ORDER BY a.applied_at DESC LIMIT 200`);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// İLETİŞİM MESAJLARI (Gelen Kutusu)
// ═══════════════════════════════════════════════════════════════════════════
router.get('/contact-messages', async (req, res) => {
  try {
    const filter = req.query.filter || 'all'; // all, new, replied
    let sql = `
      SELECT cm.*, u.full_name AS user_name, u.avatar_url AS user_avatar
      FROM contact_messages cm
      LEFT JOIN users u ON u.id = cm.user_id
      WHERE 1=1`;
    if (filter === 'new')     sql += " AND cm.status IN ('new','read')";
    if (filter === 'replied') sql += " AND cm.status = 'replied'";
    if (filter === 'archived')sql += " AND cm.status = 'archived'";
    sql += ' ORDER BY cm.created_at DESC LIMIT 200';
    const [rows] = await db.query(sql);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Okundu işaretle
router.post('/contact-messages/:id/read', async (req, res) => {
  try {
    await db.query(
      "UPDATE contact_messages SET status = 'read' WHERE id = ? AND status = 'new'",
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cevap ver — bildirim olarak gönder
router.post('/contact-messages/:id/reply', async (req, res) => {
  try {
    const adminId = req.session.userId;
    const { reply } = req.body;
    if (!reply || !reply.trim())
      return res.status(400).json({ error: 'Cevap boş olamaz' });

    const [rows] = await db.query('SELECT * FROM contact_messages WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Mesaj bulunamadı' });
    const msg = rows[0];

    await db.query(
      `UPDATE contact_messages SET reply = ?, replied_by = ?, replied_at = NOW(), status = 'replied' WHERE id = ?`,
      [reply.trim(), adminId, req.params.id]
    );

    // Kullanıcı kayıtlıysa bildirim gönder
    if (msg.user_id) {
      await db.query(
        `INSERT INTO notifications (user_id, type, title, body, link_url)
         VALUES (?, 'system', ?, ?, ?)`,
        [
          msg.user_id,
          'Destek ekibinden cevap aldın 📬',
          reply.trim().slice(0, 200),
          '/profil.html'
        ]
      );
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/contact-messages/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM contact_messages WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/contact-messages/unread-count', async (req, res) => {
  try {
    const [[r]] = await db.query("SELECT COUNT(*) AS cnt FROM contact_messages WHERE status = 'new'");
    res.json({ count: r.cnt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// BİLDİRİM GÖNDERME (Broadcast)
// POST /broadcast { audience: 'all'|'new_users'|'selected', user_ids?: [], title, body, link_url? }
// ═══════════════════════════════════════════════════════════════════════════
router.post('/broadcast', async (req, res) => {
  try {
    const { audience, user_ids, title, body, link_url } = req.body;
    if (!title || !body) return res.status(400).json({ error: 'Başlık ve içerik zorunludur' });

    let targetIds = [];

    if (audience === 'all') {
      const [rows] = await db.query("SELECT id FROM users WHERE status = 'active' AND is_banned = 0");
      targetIds = rows.map(r => r.id);
    } else if (audience === 'new_users') {
      // Son 7 günde kaydolanlar
      const [rows] = await db.query(
        "SELECT id FROM users WHERE status='active' AND is_banned=0 AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)"
      );
      targetIds = rows.map(r => r.id);
    } else if (audience === 'selected') {
      if (!Array.isArray(user_ids) || user_ids.length === 0)
        return res.status(400).json({ error: 'Kullanıcı listesi boş' });
      targetIds = user_ids.map(Number).filter(Boolean);
    } else {
      return res.status(400).json({ error: 'Geçersiz hedef kitle' });
    }

    if (targetIds.length === 0) return res.json({ success: true, sent: 0 });

    // Toplu insert (bulk)
    const values = targetIds.map(uid => [uid, 'system', title.slice(0, 200), body.slice(0, 500), link_url || null]);
    await db.query(
      `INSERT INTO notifications (user_id, type, title, body, link_url) VALUES ?`,
      [values]
    );

    res.json({ success: true, sent: targetIds.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

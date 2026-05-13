// routes/jobs.js — İş ilanları (liste / detay / oluştur / kaydet)
const router = require('express').Router();
const db = require('../config/db');

const currentUserId = (req) => req.session.userId || process.env.DEMO_USER_ID || 1;

// İlan listesi (filtreli) — index.html için
router.get('/', async (req, res) => {
  try {
    const { q, city, work_type, job_type, min_budget, max_budget, sort } = req.query;
    let sql = `
      SELECT j.id, j.title, j.description, j.budget, j.currency, j.work_date, j.start_time,
             j.duration_hours, j.city, j.district, j.work_type, j.job_type, j.materials_included,
             j.view_count, j.applicant_count, j.published_at,
             u.id AS employer_id, u.full_name AS employer_name, u.avatar_url AS employer_avatar,
             u.rating_avg AS employer_rating, u.is_verified AS employer_verified,
             c.name AS category_name, c.icon AS category_icon,
             (SELECT GROUP_CONCAT(t.name) FROM job_tags jt JOIN tags t ON t.id = jt.tag_id WHERE jt.job_id = j.id) AS tags
      FROM jobs j
      JOIN users u ON u.id = j.employer_id
      JOIN categories c ON c.id = j.category_id
      WHERE j.status = 'published'
    `;
    const params = [];

    if (q) {
      sql += ' AND (j.title LIKE ? OR u.full_name LIKE ?)';
      params.push(`%${q}%`, `%${q}%`);
    }
    if (city) {
      sql += ' AND j.city = ?';
      params.push(city);
    }
    if (work_type) {
      sql += ' AND j.work_type = ?';
      params.push(work_type);
    }
    if (job_type) {
      sql += ' AND j.job_type = ?';
      params.push(job_type);
    }
    if (min_budget) {
      sql += ' AND j.budget >= ?';
      params.push(min_budget);
    }
    if (max_budget) {
      sql += ' AND j.budget <= ?';
      params.push(max_budget);
    }

    if (sort === 'newest')          sql += ' ORDER BY j.published_at DESC';
    else if (sort === 'budget_desc') sql += ' ORDER BY j.budget DESC';
    else                             sql += ' ORDER BY j.published_at DESC';

    const [rows] = await db.query(sql, params);

    // Kullanıcının kaydettiği ilanları işaretle
    const uid = currentUserId(req);
    const [bms] = await db.query('SELECT job_id FROM bookmarks WHERE user_id = ?', [uid]);
    const bmSet = new Set(bms.map(r => r.job_id));

    const data = rows.map(r => ({
      ...r,
      tags: r.tags ? r.tags.split(',') : [],
      is_bookmarked: bmSet.has(r.id),
    }));

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// İlan detayı — is-detay.html için
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT j.*, c.name AS category_name, c.icon AS category_icon,
             u.id AS employer_id, u.full_name AS employer_name, u.avatar_url AS employer_avatar,
             u.rating_avg AS employer_rating, u.rating_count AS employer_rating_count,
             u.is_verified AS employer_verified,
             (SELECT GROUP_CONCAT(t.name SEPARATOR '|') FROM job_tags jt JOIN tags t ON t.id = jt.tag_id WHERE jt.job_id = j.id) AS tags,
             (SELECT GROUP_CONCAT(t.color SEPARATOR '|') FROM job_tags jt JOIN tags t ON t.id = jt.tag_id WHERE jt.job_id = j.id) AS tag_colors
      FROM jobs j
      JOIN users u ON u.id = j.employer_id
      JOIN categories c ON c.id = j.category_id
      WHERE j.id = ?`, [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'İlan bulunamadı' });

    // View count++
    await db.query('UPDATE jobs SET view_count = view_count + 1 WHERE id = ?', [req.params.id]);

    const job = rows[0];
    job.tags = job.tags ? job.tags.split('|') : [];
    job.tag_colors = job.tag_colors ? job.tag_colors.split('|') : [];

    // Kullanıcı bu ilana başvurmuş mu / kaydetmiş mi?
    const uid = currentUserId(req);
    const [bm] = await db.query('SELECT 1 FROM bookmarks WHERE user_id = ? AND job_id = ?', [uid, req.params.id]);
    const [ap] = await db.query('SELECT id, status FROM applications WHERE worker_id = ? AND job_id = ?', [uid, req.params.id]);
    job.is_bookmarked = bm.length > 0;
    job.application = ap[0] || null;

    res.json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Yeni ilan oluştur — is-ver.html için
router.post('/', async (req, res) => {
  try {
    const uid = currentUserId(req);
    const {
      title, description, requirements, category_id, work_type, job_type,
      budget, work_date, start_time, duration_hours,
      city, district, address_text, materials_included,
      latitude, longitude, tag_ids
    } = req.body;

    if (!title || !description || !category_id || !budget || !work_date || !city) {
      return res.status(400).json({ error: 'Zorunlu alanlar eksik' });
    }

    const [result] = await db.query(`
      INSERT INTO jobs
        (employer_id, category_id, title, description, requirements,
         work_type, job_type, budget, work_date, start_time, duration_hours,
         city, district, address_text, latitude, longitude, materials_included,
         status, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', NOW())`,
      [uid, category_id, title, description, requirements || null,
       work_type || 'full_time', job_type || 'daily', budget, work_date,
       start_time || null, duration_hours || null,
       city, district || null, address_text || null,
       latitude || null, longitude || null, materials_included ? 1 : 0]
    );

    const jobId = result.insertId;

    // Etiketleri kaydet (varsa)
    if (Array.isArray(tag_ids) && tag_ids.length > 0) {
      const tagValues = tag_ids
        .filter(id => Number.isFinite(Number(id)))
        .map(id => [jobId, Number(id)]);
      if (tagValues.length > 0) {
        await db.query('INSERT INTO job_tags (job_id, tag_id) VALUES ?', [tagValues]);
      }
    }

    res.json({ success: true, id: jobId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bir ilana başvur (+ takvime otomatik kırmızı event ekle + 50₺ komisyon kes)
router.post('/:id/apply', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const uid = currentUserId(req);
    if (!req.session.userId) {
      await conn.rollback();
      return res.status(401).json({ error: 'Başvurmak için giriş yapmalısın' });
    }

    const { cover_message } = req.body;

    // Daha önce başvurmuş mu kontrol et
    const [existing] = await conn.query(
      'SELECT id FROM applications WHERE job_id = ? AND worker_id = ?',
      [req.params.id, uid]
    );
    if (existing.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'Zaten başvurdun' });
    }

    // 50₺ başvuru komisyonu kes (cüzdandan)
    const payment = require('./payment');
    try {
      await payment.chargeApplicationFee(uid, req.params.id, conn);
    } catch (feeErr) {
      await conn.rollback();
      return res.status(402).json({ error: feeErr.message, requires_topup: true });
    }

    // Başvuruyu oluştur
    await conn.query(
      `INSERT INTO applications (job_id, worker_id, cover_message)
       VALUES (?, ?, ?)`,
      [req.params.id, uid, cover_message || null]
    );
    await conn.query('UPDATE jobs SET applicant_count = applicant_count + 1 WHERE id = ?', [req.params.id]);

    // Takvime otomatik kırmızı (rose) event ekle
    const [jobs] = await conn.query(
      'SELECT title, work_date, start_time FROM jobs WHERE id = ?',
      [req.params.id]
    );
    if (jobs.length > 0) {
      const j = jobs[0];
      await conn.query(`
        INSERT INTO calendar_events (user_id, job_id, title, note, event_date, start_time, color, source)
        VALUES (?, ?, ?, ?, ?, ?, 'rose', 'job')
        ON DUPLICATE KEY UPDATE color='rose'`,
        [uid, req.params.id, j.title, 'Başvuru bekleniyor', j.work_date, j.start_time || null]
      );
    }

    await conn.commit();
    res.json({ success: true, fee_charged: payment.APPLICATION_FEE });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Zaten başvurdun' });
    }
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// Başvuru durumunu güncelle (işveren tarafı) — takvim rengi otomatik değişir
// PUT /api/jobs/applications/:applicationId/status  body: { status: 'accepted' | 'rejected' }
router.put('/applications/:applicationId/status', async (req, res) => {
  try {
    const employerId = currentUserId(req);
    const appId = req.params.applicationId;
    const { status } = req.body;

    if (!['accepted', 'rejected', 'completed', 'pending'].includes(status))
      return res.status(400).json({ error: 'Geçersiz durum' });

    // İlanın bu kullanıcıya ait olup olmadığını kontrol et
    const [rows] = await db.query(`
      SELECT a.id, a.worker_id, a.job_id, j.employer_id, j.title
      FROM applications a JOIN jobs j ON j.id = a.job_id
      WHERE a.id = ?`, [appId]);

    if (rows.length === 0) return res.status(404).json({ error: 'Başvuru bulunamadı' });
    const app = rows[0];
    if (app.employer_id !== employerId)
      return res.status(403).json({ error: 'Bu başvuruyu güncelleme yetkin yok' });

    await db.query(
      'UPDATE applications SET status = ?, responded_at = NOW() WHERE id = ?',
      [status, appId]
    );

    // Worker'ın takvimindeki ilgili event'in rengini güncelle
    const colorMap = {
      accepted:  'emerald', // yeşil
      rejected:  'slate',   // gri
      completed: 'blue',
      pending:   'rose'     // kırmızı
    };
    const newColor = colorMap[status] || 'slate';
    const noteMap = {
      accepted:  'Başvurun kabul edildi',
      rejected:  'Başvurun reddedildi',
      completed: 'İş tamamlandı',
      pending:   'Başvuru bekleniyor'
    };

    await db.query(
      `UPDATE calendar_events SET color = ?, note = ?
       WHERE user_id = ? AND job_id = ?`,
      [newColor, noteMap[status] || '', app.worker_id, app.job_id]
    );

    res.json({ success: true, status, color: newColor });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Kaydet / kaydı kaldır (bookmark toggle)
router.post('/:id/bookmark', async (req, res) => {
  try {
    const uid = currentUserId(req);
    const [existing] = await db.query(
      'SELECT 1 FROM bookmarks WHERE user_id = ? AND job_id = ?',
      [uid, req.params.id]
    );
    if (existing.length > 0) {
      await db.query('DELETE FROM bookmarks WHERE user_id = ? AND job_id = ?', [uid, req.params.id]);
      return res.json({ bookmarked: false });
    }
    await db.query('INSERT INTO bookmarks (user_id, job_id) VALUES (?, ?)', [uid, req.params.id]);
    res.json({ bookmarked: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Kategori listesi (is-ver.html'in select kutusu için)
router.get('/meta/categories', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, name, slug, icon FROM categories WHERE is_active = 1 ORDER BY sort_order'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// İŞVEREN PANELİ — Yayınladığım ilanlar (başvuru sayılarıyla)
// ═══════════════════════════════════════════════════════════════════════════
router.get('/me/employer', async (req, res) => {
  try {
    const uid = req.session.userId;
    if (!uid) return res.status(401).json({ error: 'Giriş yapılmamış' });

    const [jobs] = await db.query(`
      SELECT j.id, j.title, j.budget, j.work_date, j.start_time, j.city, j.district,
             j.status, j.view_count, j.applicant_count, j.published_at,
             c.name AS category_name, c.icon AS category_icon,
             (SELECT COUNT(*) FROM applications WHERE job_id = j.id AND status = 'pending') AS pending_count,
             (SELECT COUNT(*) FROM applications WHERE job_id = j.id AND status = 'accepted') AS accepted_count,
             (SELECT GROUP_CONCAT(t.name SEPARATOR '|') FROM job_tags jt JOIN tags t ON t.id = jt.tag_id WHERE jt.job_id = j.id) AS tags,
             (SELECT GROUP_CONCAT(t.color SEPARATOR '|') FROM job_tags jt JOIN tags t ON t.id = jt.tag_id WHERE jt.job_id = j.id) AS tag_colors
      FROM jobs j
      JOIN categories c ON c.id = j.category_id
      WHERE j.employer_id = ?
      ORDER BY j.published_at DESC`, [uid]);

    const result = jobs.map(j => ({
      ...j,
      tags: j.tags ? j.tags.split('|') : [],
      tag_colors: j.tag_colors ? j.tag_colors.split('|') : []
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// İŞVEREN İSTATİSTİKLERİ
router.get('/me/employer/stats', async (req, res) => {
  try {
    const uid = req.session.userId;
    if (!uid) return res.status(401).json({ error: 'Giriş yapılmamış' });

    const [[totalJobs]]    = await db.query('SELECT COUNT(*) AS cnt FROM jobs WHERE employer_id = ?', [uid]);
    const [[activeJobs]]   = await db.query("SELECT COUNT(*) AS cnt FROM jobs WHERE employer_id = ? AND status = 'published'", [uid]);
    const [[totalApps]]    = await db.query(`
      SELECT COUNT(*) AS cnt FROM applications a JOIN jobs j ON j.id = a.job_id WHERE j.employer_id = ?`, [uid]);
    const [[pendingApps]]  = await db.query(`
      SELECT COUNT(*) AS cnt FROM applications a JOIN jobs j ON j.id = a.job_id WHERE j.employer_id = ? AND a.status = 'pending'`, [uid]);
    const [[totalBudget]]  = await db.query("SELECT COALESCE(SUM(budget),0) AS total FROM jobs WHERE employer_id = ? AND status IN ('published','completed')", [uid]);
    const [[totalViews]]   = await db.query("SELECT COALESCE(SUM(view_count),0) AS total FROM jobs WHERE employer_id = ?", [uid]);

    res.json({
      total_jobs:    totalJobs.cnt,
      active_jobs:   activeJobs.cnt,
      total_applications: totalApps.cnt,
      pending_applications: pendingApps.cnt,
      total_budget:  parseFloat(totalBudget.total),
      total_views:   totalViews.total
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// BİR İLANIN BAŞVURANLARINI LİSTELE (sadece o ilanın sahibi)
router.get('/:id/applicants', async (req, res) => {
  try {
    const uid = req.session.userId;
    if (!uid) return res.status(401).json({ error: 'Giriş yapılmamış' });

    // İlanın bu kullanıcıya ait olduğunu doğrula
    const [own] = await db.query('SELECT employer_id, title FROM jobs WHERE id = ?', [req.params.id]);
    if (own.length === 0) return res.status(404).json({ error: 'İlan bulunamadı' });
    if (own[0].employer_id !== uid) return res.status(403).json({ error: 'Bu ilana erişim yetkin yok' });

    const [apps] = await db.query(`
      SELECT a.id, a.status, a.cover_message, a.applied_at, a.responded_at,
             u.id AS worker_id, u.full_name AS worker_name, u.avatar_url AS worker_avatar,
             u.title AS worker_title, u.rating_avg, u.rating_count, u.is_verified,
             u.city, u.district
      FROM applications a
      JOIN users u ON u.id = a.worker_id
      WHERE a.job_id = ?
      ORDER BY FIELD(a.status,'pending','accepted','completed','rejected','withdrawn'), a.applied_at DESC`,
      [req.params.id]
    );

    res.json({ job_title: own[0].title, applicants: apps });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// İLANI ARŞİVLE / SİL (sahibi)
router.delete('/:id', async (req, res) => {
  try {
    const uid = req.session.userId;
    if (!uid) return res.status(401).json({ error: 'Giriş yapılmamış' });
    const [own] = await db.query('SELECT employer_id FROM jobs WHERE id = ?', [req.params.id]);
    if (own.length === 0) return res.status(404).json({ error: 'İlan yok' });
    if (own[0].employer_id !== uid) return res.status(403).json({ error: 'Yetkin yok' });
    await db.query('DELETE FROM jobs WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// İLAN DURUMUNU DEĞİŞTİR (published/closed)
router.put('/:id/status', async (req, res) => {
  try {
    const uid = req.session.userId;
    if (!uid) return res.status(401).json({ error: 'Giriş yapılmamış' });
    const { status } = req.body;
    if (!['published','closed','completed'].includes(status))
      return res.status(400).json({ error: 'Geçersiz durum' });

    const [own] = await db.query('SELECT employer_id FROM jobs WHERE id = ?', [req.params.id]);
    if (own.length === 0) return res.status(404).json({ error: 'İlan yok' });
    if (own[0].employer_id !== uid) return res.status(403).json({ error: 'Yetkin yok' });

    await db.query('UPDATE jobs SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Etiket listesi (is-ver.html için)
router.get('/meta/tags', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, name, slug, color FROM tags ORDER BY id');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// İŞVEREN PROFİLİ (isveren-profil.html için)
// ═══════════════════════════════════════════════════════════════════════════
router.get('/users/:id/public', async (req, res) => {
  try {
    const meId = req.session.userId || null;
    const targetId = Number(req.params.id);

    // Kullanıcı bilgileri
    const [users] = await db.query(`
      SELECT id, full_name, email, phone, title, bio, avatar_url, role,
             city, district, rating_avg, rating_count, is_verified, is_online,
             total_earnings, created_at
      FROM users WHERE id = ?`, [targetId]);

    if (users.length === 0) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    const user = users[0];
    delete user.email;
    delete user.phone;

    // Verdiği iş ilanları
    const [jobs] = await db.query(`
      SELECT j.id, j.title, j.budget, j.work_date, j.city, j.district,
             j.applicant_count, j.view_count, j.status, j.published_at,
             c.name AS category_name,
             (SELECT GROUP_CONCAT(t.name SEPARATOR '|') FROM job_tags jt JOIN tags t ON t.id = jt.tag_id WHERE jt.job_id = j.id) AS tags,
             (SELECT GROUP_CONCAT(t.color SEPARATOR '|') FROM job_tags jt JOIN tags t ON t.id = jt.tag_id WHERE jt.job_id = j.id) AS tag_colors
      FROM jobs j
      JOIN categories c ON c.id = j.category_id
      WHERE j.employer_id = ? AND j.status = 'published'
      ORDER BY j.published_at DESC
      LIMIT 30`, [targetId]);

    const jobList = jobs.map(j => ({
      ...j,
      tags: j.tags ? j.tags.split('|') : [],
      tag_colors: j.tag_colors ? j.tag_colors.split('|') : [],
    }));

    // Takipçi sayıları
    const [[fCount]] = await db.query(
      'SELECT COUNT(*) AS cnt FROM follows WHERE followed_id = ?', [targetId]
    );
    const [[fgCount]] = await db.query(
      'SELECT COUNT(*) AS cnt FROM follows WHERE follower_id = ?', [targetId]
    );

    // Mevcut kullanıcı takip ediyor mu?
    let is_following = false;
    if (meId && meId !== targetId) {
      const [[fr]] = await db.query(
        'SELECT COUNT(*) AS cnt FROM follows WHERE follower_id = ? AND followed_id = ?',
        [meId, targetId]
      );
      is_following = fr.cnt > 0;
    }

    res.json({
      user,
      jobs: jobList,
      followers_count: fCount.cnt,
      following_count: fgCount.cnt,
      is_following,
      is_self: meId === targetId
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

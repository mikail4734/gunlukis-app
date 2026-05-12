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
      city, district, address_text, materials_included
    } = req.body;

    if (!title || !description || !category_id || !budget || !work_date || !city) {
      return res.status(400).json({ error: 'Zorunlu alanlar eksik' });
    }

    const [result] = await db.query(`
      INSERT INTO jobs
        (employer_id, category_id, title, description, requirements,
         work_type, job_type, budget, work_date, start_time, duration_hours,
         city, district, address_text, materials_included, status, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', NOW())`,
      [uid, category_id, title, description, requirements || null,
       work_type || 'full_time', job_type || 'daily', budget, work_date,
       start_time || null, duration_hours || null,
       city, district || null, address_text || null, materials_included ? 1 : 0]
    );

    res.json({ success: true, id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bir ilana başvur
router.post('/:id/apply', async (req, res) => {
  try {
    const uid = currentUserId(req);
    const { cover_message } = req.body;
    await db.query(
      `INSERT INTO applications (job_id, worker_id, cover_message)
       VALUES (?, ?, ?)`,
      [req.params.id, uid, cover_message || null]
    );
    await db.query('UPDATE jobs SET applicant_count = applicant_count + 1 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Zaten başvurdun' });
    }
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

module.exports = router;

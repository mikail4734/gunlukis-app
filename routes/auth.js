// routes/auth.js — Kimlik Doğrulama (Giriş / Kayıt / Google / Şifre Sıfırlama)
const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const db      = require('../config/db');
const https   = require('https');

// ─── In-memory şifre sıfırlama kodları ────────────────────────────────────
// { email → { code, expires, verified } }
const resetCodes = new Map();
setInterval(() => {
  const now = Date.now();
  resetCodes.forEach((v, k) => { if (v.expires < now) resetCodes.delete(k); });
}, 60_000); // Her dakika temizle

// ─── Yardımcı: e-posta gönder ─────────────────────────────────────────────
async function sendMail({ to, subject, html }) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log(`\n📧 [DEV EMAIL] To: ${to}\nSubject: ${subject}\n${html.replace(/<[^>]+>/g,'')}\n`);
    return;
  }
  const nodemailer = require('nodemailer');
  const t = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: false,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
  await t.sendMail({ from: process.env.EMAIL_FROM || process.env.EMAIL_USER, to, subject, html });
}

// ─── Yardımcı: Google token doğrula ──────────────────────────────────────
function verifyGoogleToken(idToken) {
  return new Promise((resolve, reject) => {
    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        const json = JSON.parse(data);
        if (json.error || json.error_description) return reject(new Error('Geçersiz Google token'));
        // Audience kontrolü (opsiyonel ama güvenli)
        const clientId = process.env.GOOGLE_CLIENT_ID;
        if (clientId && json.aud !== clientId) return reject(new Error('Token audience uyuşmuyor'));
        resolve(json);
      });
    }).on('error', reject);
  });
}

// ══════════════════════════════════════════════════════════════════════════
// KAYIT
// ══════════════════════════════════════════════════════════════════════════
router.post('/register', async (req, res) => {
  try {
    const { full_name, email, password, phone, role } = req.body;
    if (!full_name || !email || !password)
      return res.status(400).json({ error: 'Ad, e-posta ve şifre zorunludur' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Şifre en az 6 karakter olmalı' });

    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      `INSERT INTO users (full_name, email, password_hash, phone, role)
       VALUES (?, ?, ?, ?, ?)`,
      [full_name.trim(), email.toLowerCase().trim(), hash, phone || null, role || 'worker']
    );
    req.session.userId = result.insertId;
    res.json({
      success: true,
      user: { id: result.insertId, full_name, email, role: role || 'worker', avatar_url: null }
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'Bu e-posta zaten kayıtlı' });
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// GİRİŞ
// ══════════════════════════════════════════════════════════════════════════
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'E-posta ve şifre zorunludur' });

    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (rows.length === 0)
      return res.status(401).json({ error: 'Hatalı e-posta veya şifre' });

    const user = rows[0];
    if (!user.password_hash)
      return res.status(401).json({ error: 'Bu hesap Google ile oluşturuldu, Google ile giriş yapın' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Hatalı e-posta veya şifre' });

    req.session.userId = user.id;
    await db.query('UPDATE users SET is_online=1, last_seen_at=NOW() WHERE id=?', [user.id]);
    res.json({
      success: true,
      user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role, avatar_url: user.avatar_url }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// GOOGLE İLE GİRİŞ
// ══════════════════════════════════════════════════════════════════════════
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'Google token eksik' });

    const gInfo = await verifyGoogleToken(credential);
    const { email, name, picture, sub: googleId } = gInfo;

    if (!email) return res.status(400).json({ error: 'Google hesabında e-posta yok' });

    let [rows] = await db.query('SELECT * FROM users WHERE email=?', [email.toLowerCase()]);
    let user;

    if (rows.length === 0) {
      // Yeni kullanıcı oluştur
      try {
        const [result] = await db.query(
          `INSERT INTO users (full_name, email, google_id, avatar_url, role, is_verified)
           VALUES (?, ?, ?, ?, 'worker', 1)`,
          [name, email.toLowerCase(), googleId, picture || null]
        );
        user = { id: result.insertId, full_name: name, email, role: 'worker', avatar_url: picture };
      } catch (insertErr) {
        // google_id kolonu yoksa yeniden dene
        const [result] = await db.query(
          `INSERT INTO users (full_name, email, avatar_url, role, is_verified)
           VALUES (?, ?, ?, 'worker', 1)`,
          [name, email.toLowerCase(), picture || null]
        );
        user = { id: result.insertId, full_name: name, email, role: 'worker', avatar_url: picture };
      }
    } else {
      user = rows[0];
      // Avatar güncelle (yoksa)
      const newAvatar = user.avatar_url || picture;
      await db.query(
        'UPDATE users SET avatar_url = COALESCE(NULLIF(avatar_url,""), ?) WHERE id=?',
        [picture || user.avatar_url, user.id]
      );
      user.avatar_url = newAvatar;
    }

    req.session.userId = user.id;
    await db.query('UPDATE users SET is_online=1, last_seen_at=NOW() WHERE id=?', [user.id]);
    res.json({
      success: true,
      user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role, avatar_url: user.avatar_url }
    });
  } catch (err) {
    console.error('Google auth error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// ÇIKIŞ
// ══════════════════════════════════════════════════════════════════════════
router.post('/logout', async (req, res) => {
  if (req.session.userId) {
    try { await db.query('UPDATE users SET is_online=0 WHERE id=?', [req.session.userId]); } catch {}
  }
  req.session.destroy(() => res.json({ success: true }));
});

// ══════════════════════════════════════════════════════════════════════════
// MEVCUT KULLANICI BİLGİSİ
// ══════════════════════════════════════════════════════════════════════════
router.get('/me', async (req, res) => {
  try {
    const uid = req.session.userId;
    if (!uid) return res.status(401).json({ error: 'Giriş yapılmamış' });

    const [rows] = await db.query(
      `SELECT id, full_name, email, phone, role, title, avatar_url, city, district,
              rating_avg, rating_count, total_earnings, pending_balance
       FROM users WHERE id=?`, [uid]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// AYARLAR — Profil Güncelle + Şifre Değiştir
// ══════════════════════════════════════════════════════════════════════════
router.put('/me', async (req, res) => {
  try {
    const uid = req.session.userId;
    if (!uid) return res.status(401).json({ error: 'Giriş yapılmamış' });

    const { full_name, phone, current_password, new_password } = req.body;

    if (new_password) {
      if (new_password.length < 6)
        return res.status(400).json({ error: 'Yeni şifre en az 6 karakter olmalı' });

      const [users] = await db.query('SELECT password_hash FROM users WHERE id=?', [uid]);
      const hash = users[0]?.password_hash;

      if (!hash)
        return res.status(400).json({ error: 'Google hesabı için şifre değiştirilemez' });

      const ok = await bcrypt.compare(current_password || '', hash);
      if (!ok) return res.status(401).json({ error: 'Mevcut şifre yanlış' });

      const newHash = await bcrypt.hash(new_password, 10);
      await db.query('UPDATE users SET password_hash=? WHERE id=?', [newHash, uid]);
    }

    if (full_name || phone) {
      await db.query(
        'UPDATE users SET full_name=COALESCE(?,full_name), phone=COALESCE(?,phone) WHERE id=?',
        [full_name || null, phone || null, uid]
      );
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// ŞİFREMİ UNUTTUM — Kod Gönder
// ══════════════════════════════════════════════════════════════════════════
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'E-posta zorunludur' });

    const [users] = await db.query('SELECT id FROM users WHERE email=?', [email.toLowerCase().trim()]);
    if (users.length === 0) {
      // Gizlilik için başarı döndür (e-posta var mı açıklamıyoruz)
      return res.json({ success: true });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    resetCodes.set(email.toLowerCase(), { code, expires: Date.now() + 10 * 60 * 1000, verified: false });

    await sendMail({
      to: email,
      subject: 'Günlükİş — Şifre Sıfırlama Kodu',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <div style="background:#2563eb;padding:16px 24px;border-radius:12px;margin-bottom:24px">
            <h2 style="color:white;margin:0">Günlükİş</h2>
          </div>
          <h3 style="color:#0f172a">Şifre Sıfırlama Talebi</h3>
          <p style="color:#475569">Şifrenizi sıfırlamak için aşağıdaki doğrulama kodunu kullanın:</p>
          <div style="background:#f1f5f9;border-radius:12px;padding:24px;text-align:center;margin:24px 0">
            <span style="font-size:2.5rem;font-weight:900;letter-spacing:12px;color:#2563eb">${code}</span>
          </div>
          <p style="color:#94a3b8;font-size:13px">Bu kod 10 dakika geçerlidir. Şifre sıfırlama talebinde bulunmadıysanız bu e-postayı görmezden gelin.</p>
        </div>`
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// KODU DOĞRULA
// ══════════════════════════════════════════════════════════════════════════
router.post('/verify-reset-code', (req, res) => {
  const { email, code } = req.body;
  const entry = resetCodes.get(email?.toLowerCase());
  if (!entry || entry.code !== String(code) || Date.now() > entry.expires)
    return res.status(400).json({ error: 'Geçersiz veya süresi dolmuş kod' });
  entry.verified = true;
  res.json({ success: true });
});

// ══════════════════════════════════════════════════════════════════════════
// YENİ ŞİFRE BELİRLE
// ══════════════════════════════════════════════════════════════════════════
router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, new_password } = req.body;
    if (!new_password || new_password.length < 6)
      return res.status(400).json({ error: 'Şifre en az 6 karakter olmalı' });

    const entry = resetCodes.get(email?.toLowerCase());
    if (!entry || entry.code !== String(code) || !entry.verified || Date.now() > entry.expires)
      return res.status(400).json({ error: 'Geçersiz veya süresi dolmuş token' });

    const hash = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE users SET password_hash=? WHERE email=?', [hash, email.toLowerCase()]);
    resetCodes.delete(email.toLowerCase());
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// GOOGLE CLIENT ID (frontend için)
// ══════════════════════════════════════════════════════════════════════════
router.get('/config', (req, res) => {
  res.json({ google_client_id: process.env.GOOGLE_CLIENT_ID || '' });
});

// ══════════════════════════════════════════════════════════════════════════
// BAŞVURULARIM
// ══════════════════════════════════════════════════════════════════════════
router.get('/applications', async (req, res) => {
  try {
    const uid = req.session.userId || process.env.DEMO_USER_ID || 1;
    const [rows] = await db.query(`
      SELECT a.id, a.status, a.cover_message, a.applied_at,
             j.id AS job_id, j.title, j.budget, j.work_date, j.city, j.district,
             u.full_name AS employer_name, u.avatar_url AS employer_avatar
      FROM applications a
      JOIN jobs j ON j.id = a.job_id
      JOIN users u ON u.id = j.employer_id
      WHERE a.worker_id = ?
      ORDER BY a.applied_at DESC`, [uid]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/applications/:id', async (req, res) => {
  try {
    const uid = req.session.userId || process.env.DEMO_USER_ID || 1;
    const [result] = await db.query(
      'DELETE FROM applications WHERE id=? AND worker_id=?',
      [req.params.id, uid]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Başvuru bulunamadı' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// FAVORİLERİM (Kaydettiklerim)
// ══════════════════════════════════════════════════════════════════════════
router.get('/bookmarks', async (req, res) => {
  try {
    const uid = req.session.userId || process.env.DEMO_USER_ID || 1;
    const [rows] = await db.query(`
      SELECT j.id, j.title, j.budget, j.work_date, j.city, j.district, j.work_type,
             u.full_name AS employer_name, u.avatar_url AS employer_avatar,
             b.saved_at
      FROM bookmarks b
      JOIN jobs j ON j.id = b.job_id
      JOIN users u ON u.id = j.employer_id
      WHERE b.user_id = ?
      ORDER BY b.saved_at DESC`, [uid]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/bookmarks/:jobId', async (req, res) => {
  try {
    const uid = req.session.userId || process.env.DEMO_USER_ID || 1;
    await db.query('DELETE FROM bookmarks WHERE user_id=? AND job_id=?', [uid, req.params.jobId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// routes/payment.js — Cüzdan & Ödeme sistemi (sanal — iyzico entegrasyonu için hazır)
const router = require('express').Router();
const db = require('../config/db');

// ─── SİSTEM AYARLARI ─────────────────────────────────────────────────────────
const APPLICATION_FEE = 50;        // Her başvuruda alınan komisyon (₺)
const MIN_WITHDRAWAL  = 100;       // Minimum çekim tutarı (₺)
const COMMISSION_RATE = 0.05;      // İş ödemesinden alınan komisyon (%5)

// ═══════════════════════════════════════════════════════════════════════════
// CÜZDAN BİLGİSİ
// ═══════════════════════════════════════════════════════════════════════════
router.get('/wallet', async (req, res) => {
  try {
    const uid = req.session.userId;
    if (!uid) return res.status(401).json({ error: 'Giriş yapılmamış' });

    const [rows] = await db.query(`
      SELECT wallet_balance, pending_balance, total_earnings,
             iban, card_holder, card_last4, card_brand
      FROM users WHERE id = ?`, [uid]);

    if (rows.length === 0) return res.status(404).json({ error: 'Kullanıcı yok' });
    const u = rows[0];

    res.json({
      wallet_balance:   parseFloat(u.wallet_balance),
      pending_balance:  parseFloat(u.pending_balance),
      total_earnings:   parseFloat(u.total_earnings),
      payment_info: {
        iban:        u.iban ? maskIban(u.iban) : null,
        card_holder: u.card_holder,
        card_last4:  u.card_last4,
        card_brand:  u.card_brand,
        has_iban:    !!u.iban,
        has_card:    !!u.card_last4
      },
      settings: {
        application_fee:  APPLICATION_FEE,
        min_withdrawal:   MIN_WITHDRAWAL,
        commission_rate:  COMMISSION_RATE
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function maskIban(iban) {
  if (!iban) return null;
  const clean = iban.replace(/\s/g, '');
  if (clean.length < 10) return clean;
  return clean.slice(0, 6) + ' **** **** **** ' + clean.slice(-4);
}

// ═══════════════════════════════════════════════════════════════════════════
// ÖDEME BİLGİLERİ KAYDET (IBAN + kart bilgisi)
// NOT: Tam kart numarası ASLA kaydedilmez! Sadece son 4 hane + brand.
// Gerçek ödeme için iyzico/PayTR token sistemi gerekli.
// ═══════════════════════════════════════════════════════════════════════════
router.put('/payment-info', async (req, res) => {
  try {
    const uid = req.session.userId;
    if (!uid) return res.status(401).json({ error: 'Giriş yapılmamış' });

    const { iban, card_holder, card_number } = req.body;

    const updates = [];
    const params = [];

    // IBAN doğrula (TR ile başlamalı, 26 hane)
    if (iban !== undefined) {
      const cleanIban = (iban || '').replace(/\s/g, '').toUpperCase();
      if (cleanIban && !/^TR\d{24}$/.test(cleanIban)) {
        return res.status(400).json({ error: 'Geçersiz IBAN (TR ile başlamalı, toplam 26 karakter)' });
      }
      updates.push('iban = ?');
      params.push(cleanIban || null);
    }

    // Kart sahibi
    if (card_holder !== undefined) {
      updates.push('card_holder = ?');
      params.push(card_holder ? card_holder.trim().toUpperCase().slice(0, 150) : null);
    }

    // Kart numarası — sadece son 4 hane + brand saklanır
    if (card_number !== undefined) {
      const clean = (card_number || '').replace(/\s/g, '');
      if (clean) {
        if (!/^\d{13,19}$/.test(clean)) {
          return res.status(400).json({ error: 'Geçersiz kart numarası' });
        }
        // Luhn algoritmasıyla doğrula
        if (!isLuhnValid(clean)) {
          return res.status(400).json({ error: 'Kart numarası hatalı (geçersiz format)' });
        }
        const last4 = clean.slice(-4);
        const brand = detectCardBrand(clean);
        updates.push('card_last4 = ?', 'card_brand = ?');
        params.push(last4, brand);
      } else {
        updates.push('card_last4 = ?', 'card_brand = ?');
        params.push(null, null);
      }
    }

    if (updates.length === 0) return res.status(400).json({ error: 'Güncellenecek alan yok' });

    params.push(uid);
    await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function detectCardBrand(num) {
  if (/^4/.test(num)) return 'Visa';
  if (/^5[1-5]/.test(num) || /^2[2-7]/.test(num)) return 'Mastercard';
  if (/^3[47]/.test(num)) return 'Amex';
  if (/^6/.test(num)) return 'Troy';
  return 'Kart';
}

function isLuhnValid(num) {
  let sum = 0, alt = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let n = parseInt(num[i], 10);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// İŞLEM GEÇMİŞİ
// ═══════════════════════════════════════════════════════════════════════════
router.get('/transactions', async (req, res) => {
  try {
    const uid = req.session.userId;
    if (!uid) return res.status(401).json({ error: 'Giriş yapılmamış' });

    const [rows] = await db.query(`
      SELECT id, type, amount, balance_after, status,
             reference_type, reference_id, note, created_at
      FROM transactions WHERE user_id = ?
      ORDER BY created_at DESC LIMIT 100`, [uid]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// BAKİYE YÜKLEME (Simülasyon — gerçek için iyzico entegrasyonu)
// İLERİDE: Bu endpoint iyzico ödeme başlatır, ödeme onayında bakiye eklenir
// ═══════════════════════════════════════════════════════════════════════════
router.post('/deposit', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const uid = req.session.userId;
    if (!uid) return res.status(401).json({ error: 'Giriş yapılmamış' });

    const { amount } = req.body;
    const amt = parseFloat(amount);
    if (!amt || amt < 10) return res.status(400).json({ error: 'Minimum 10 ₺ yükleyebilirsin' });
    if (amt > 10000) return res.status(400).json({ error: 'Tek seferde maksimum 10.000 ₺' });

    // Kartı olup olmadığını kontrol et
    const [[u]] = await conn.query('SELECT card_last4, wallet_balance FROM users WHERE id = ?', [uid]);
    if (!u.card_last4) {
      return res.status(400).json({ error: 'Önce ödeme bilgilerinden kart eklemelisin (Ayarlar)' });
    }

    // Bakiyeyi yükle (simülasyon)
    const newBalance = parseFloat(u.wallet_balance) + amt;
    await conn.query('UPDATE users SET wallet_balance = ? WHERE id = ?', [newBalance, uid]);

    await conn.query(`
      INSERT INTO transactions (user_id, type, amount, balance_after, status, reference_type, note)
      VALUES (?, 'deposit', ?, ?, 'completed', 'manual', ?)`,
      [uid, amt, newBalance, `Bakiye yüklendi (sanal — kart: **** ${u.card_last4})`]
    );

    await conn.commit();
    res.json({ success: true, new_balance: newBalance });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PARA ÇEKME TALEBİ
// ═══════════════════════════════════════════════════════════════════════════
router.post('/withdraw', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const uid = req.session.userId;
    if (!uid) return res.status(401).json({ error: 'Giriş yapılmamış' });

    const { amount } = req.body;
    const amt = parseFloat(amount);
    if (!amt || amt < MIN_WITHDRAWAL) {
      return res.status(400).json({ error: `Minimum çekim tutarı ${MIN_WITHDRAWAL} ₺` });
    }

    const [[u]] = await conn.query(
      'SELECT wallet_balance, iban, card_holder, full_name FROM users WHERE id = ?', [uid]
    );
    if (!u.iban) return res.status(400).json({ error: 'Önce IBAN ekle (Ayarlar > Ödeme Bilgileri)' });
    if (parseFloat(u.wallet_balance) < amt) {
      return res.status(400).json({ error: 'Yetersiz bakiye' });
    }

    // Bakiyeden düş (talep onaylanmadan da düş; iptal edilirse iade)
    const newBalance = parseFloat(u.wallet_balance) - amt;
    await conn.query('UPDATE users SET wallet_balance = ? WHERE id = ?', [newBalance, uid]);

    // Talep oluştur
    const [r] = await conn.query(`
      INSERT INTO withdrawal_requests (user_id, amount, iban, account_name, status)
      VALUES (?, ?, ?, ?, 'pending')`,
      [uid, amt, u.iban, u.card_holder || u.full_name]
    );

    await conn.query(`
      INSERT INTO transactions (user_id, type, amount, balance_after, status, reference_type, reference_id, note)
      VALUES (?, 'withdrawal', ?, ?, 'pending', 'withdrawal', ?, 'Para çekme talebi oluşturuldu')`,
      [uid, -amt, newBalance, r.insertId]
    );

    await conn.commit();
    res.json({ success: true, request_id: r.insertId, new_balance: newBalance });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// Kullanıcının çekim talepleri
router.get('/withdrawals', async (req, res) => {
  try {
    const uid = req.session.userId;
    if (!uid) return res.status(401).json({ error: 'Giriş yapılmamış' });
    const [rows] = await db.query(`
      SELECT id, amount, status, admin_note, created_at, processed_at
      FROM withdrawal_requests WHERE user_id = ?
      ORDER BY created_at DESC LIMIT 50`, [uid]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// BAŞVURU KOMİSYONU (iş başvurusunda otomatik kesilir)
// Internal — applyForJob çağrısından önce çalışır
// ═══════════════════════════════════════════════════════════════════════════
async function chargeApplicationFee(userId, jobId, conn) {
  const [[u]] = await conn.query('SELECT wallet_balance FROM users WHERE id = ?', [userId]);
  if (parseFloat(u.wallet_balance) < APPLICATION_FEE) {
    throw new Error(`Yetersiz bakiye. Başvuru ücreti ${APPLICATION_FEE} ₺. Mevcut: ${u.wallet_balance} ₺`);
  }
  const newBalance = parseFloat(u.wallet_balance) - APPLICATION_FEE;
  await conn.query('UPDATE users SET wallet_balance = ? WHERE id = ?', [newBalance, userId]);
  await conn.query(`
    INSERT INTO transactions (user_id, type, amount, balance_after, status, reference_type, reference_id, note)
    VALUES (?, 'commission', ?, ?, 'completed', 'application', ?, ?)`,
    [userId, -APPLICATION_FEE, newBalance, jobId, 'İş başvurusu komisyonu']
  );
  return newBalance;
}

// ═══════════════════════════════════════════════════════════════════════════
// İŞ ÖDEMESİ (işveren → işçi, sistem %5 komisyon alır)
// İşveren "tamamlandı" işaretlerse veya manuel olarak ödeme gönderirse
// ═══════════════════════════════════════════════════════════════════════════
router.post('/pay-worker', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const employerId = req.session.userId;
    if (!employerId) return res.status(401).json({ error: 'Giriş yapılmamış' });

    const { application_id } = req.body;
    if (!application_id) return res.status(400).json({ error: 'application_id zorunlu' });

    // Başvuru detayını çek
    const [apps] = await conn.query(`
      SELECT a.id, a.worker_id, a.job_id, a.status, j.title, j.budget, j.employer_id
      FROM applications a JOIN jobs j ON j.id = a.job_id
      WHERE a.id = ?`, [application_id]);
    if (apps.length === 0) return res.status(404).json({ error: 'Başvuru yok' });
    const app = apps[0];

    if (app.employer_id !== employerId)
      return res.status(403).json({ error: 'Bu başvuruya ödeme yapma yetkin yok' });
    if (app.status !== 'accepted' && app.status !== 'completed')
      return res.status(400).json({ error: 'Önce başvuruyu kabul etmelisin' });

    // İşverenin bakiyesini kontrol et
    const budget = parseFloat(app.budget);
    const [[emp]] = await conn.query('SELECT wallet_balance FROM users WHERE id = ?', [employerId]);
    if (parseFloat(emp.wallet_balance) < budget) {
      return res.status(400).json({ error: `Yetersiz bakiye. Önce ${budget} ₺ yüklemelisin.` });
    }

    // İşverenden düş
    const empNewBalance = parseFloat(emp.wallet_balance) - budget;
    await conn.query('UPDATE users SET wallet_balance = ? WHERE id = ?', [empNewBalance, employerId]);
    await conn.query(`
      INSERT INTO transactions (user_id, type, amount, balance_after, status, reference_type, reference_id, note)
      VALUES (?, 'job_payment', ?, ?, 'completed', 'application', ?, ?)`,
      [employerId, -budget, empNewBalance, application_id, `İş ödemesi: ${app.title}`]
    );

    // Komisyon hesapla (%5)
    const commission = +(budget * COMMISSION_RATE).toFixed(2);
    const workerEarning = budget - commission;

    // İşçiye ekle (komisyon düşüldükten sonra)
    const [[wkr]] = await conn.query('SELECT wallet_balance, total_earnings FROM users WHERE id = ?', [app.worker_id]);
    const wkrNewBalance = parseFloat(wkr.wallet_balance) + workerEarning;
    const wkrNewEarnings = parseFloat(wkr.total_earnings) + workerEarning;
    await conn.query(
      'UPDATE users SET wallet_balance = ?, total_earnings = ? WHERE id = ?',
      [wkrNewBalance, wkrNewEarnings, app.worker_id]
    );
    await conn.query(`
      INSERT INTO transactions (user_id, type, amount, balance_after, status, reference_type, reference_id, note)
      VALUES (?, 'job_earning', ?, ?, 'completed', 'application', ?, ?)`,
      [app.worker_id, workerEarning, wkrNewBalance, application_id,
       `İş kazancı: ${app.title} (${commission} ₺ komisyon kesildi)`]
    );

    // İşi tamamlandı işaretle
    await conn.query("UPDATE applications SET status='completed', completed_at=NOW() WHERE id = ?", [application_id]);

    // İşçiye bildirim
    await conn.query(`
      INSERT INTO notifications (user_id, type, title, body, link_url)
      VALUES (?, 'payment', ?, ?, ?)`,
      [app.worker_id, '💰 Ödemeni aldın!', `${workerEarning.toFixed(2)} ₺ hesabına eklendi. (${commission.toFixed(2)} ₺ platform komisyonu kesildi)`, '/profil.html']
    );

    await conn.commit();
    res.json({
      success: true,
      paid: budget,
      commission,
      worker_received: workerEarning,
      new_balance: empNewBalance
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// chargeApplicationFee'yi dışa aç (jobs.js'den kullanmak için)
module.exports = router;
module.exports.chargeApplicationFee = chargeApplicationFee;
module.exports.APPLICATION_FEE = APPLICATION_FEE;

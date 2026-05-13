// public/js/api.js — Tüm sayfalarda kullanılan ortak API yardımcısı
const API_BASE = '';  // aynı origin'de çalışıyoruz

async function apiGet(url) {
  const res = await fetch(API_BASE + url, { credentials: 'include' });
  if (!res.ok) throw new Error((await res.json()).error || 'Hata');
  return res.json();
}

async function apiPost(url, data) {
  const res = await fetch(API_BASE + url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {})
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Hata');
  return res.json();
}

async function apiPut(url, data) {
  const res = await fetch(API_BASE + url, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {})
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Hata');
  return res.json();
}

async function apiDelete(url) {
  const res = await fetch(API_BASE + url, { method: 'DELETE', credentials: 'include' });
  if (!res.ok) throw new Error((await res.json()).error || 'Hata');
  return res.json();
}

// Genel toast (her sayfanın #toast-container'ı varsa)
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) { console.log(message); return; }
  const toast = document.createElement('div');
  toast.className = 'toast flex items-center gap-2';
  const icon = type === 'error'
    ? '<i class="fa-solid fa-circle-xmark text-red-400"></i>'
    : '<i class="fa-solid fa-circle-check text-green-400"></i>';
  toast.innerHTML = `${icon} ${message}`;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// Tarih biçimleyici
function formatTurkishDate(dateStr) {
  if (!dateStr) return '';
  const aylar = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
                 'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  const d = new Date(dateStr);
  return `${d.getDate()} ${aylar[d.getMonth()]} ${d.getFullYear()}`;
}

function formatBudget(amount) {
  return new Intl.NumberFormat('tr-TR').format(amount);
}

// ─── Auth Yardımcıları ─────────────────────────────────────────────────────

// Generic placeholder avatar (SVG data URI) — kullanıcı giriş yapmadıysa
const GUEST_AVATAR = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="#f1f5f9"/><circle cx="32" cy="26" r="11" fill="#cbd5e1"/><path d="M10 60c0-12 10-20 22-20s22 8 22 20" fill="#cbd5e1"/></svg>`
);

// Header'daki avatar + dropdown'u gerçek kullanıcı ile günceller
async function loadHeaderUser() {
  try {
    const user = await apiGet('/api/auth/me');
    // Avatar
    if (user.avatar_url) {
      document.querySelectorAll('#header-avatar').forEach(el => el.src = user.avatar_url);
      document.querySelectorAll('#header-avatar-m').forEach(el => el.src = user.avatar_url);
    }
    // Dropdown'daki isim varsa güncelle
    const nameEl = document.getElementById('header-user-name');
    if (nameEl) nameEl.textContent = user.full_name;
    // localStorage cache
    localStorage.setItem('gu_user', JSON.stringify(user));

    // ADMIN ise: dropdown'a "Admin Panel" linki ekle
    if (user.is_admin) {
      document.querySelectorAll('button[onclick="logoutUser()"]').forEach(btn => {
        // Aynı linki birden fazla ekleme
        const dropdown = btn.parentElement;
        if (dropdown && !dropdown.querySelector('a[href="admin.html"]')) {
          const adminLink = document.createElement('a');
          adminLink.href = 'admin.html';
          adminLink.className = 'block px-5 py-2.5 text-sm font-bold text-purple-600 hover:bg-purple-50 transition';
          adminLink.innerHTML = '<i class="fa-solid fa-shield-halved mr-1.5"></i> Admin Panel';
          dropdown.insertBefore(adminLink, btn);
        }
      });
    }

    return user;
  } catch {
    // Giriş yapılmamış → generic ikon göster + dropdown linklerini "giris.html" yap
    document.querySelectorAll('#header-avatar, #header-avatar-m').forEach(el => {
      el.src = GUEST_AVATAR;
    });
    // Dropdown linklerini değiştir (varsa)
    document.querySelectorAll('a[href="profil.html"], a[href="ayarlar.html"], a[href^="profil.html#"]').forEach(a => {
      a.setAttribute('href', 'giris.html');
    });
    // Çıkış butonunu "Giriş Yap"a çevir
    document.querySelectorAll('button[onclick="logoutUser()"]').forEach(b => {
      b.textContent = 'Giriş Yap';
      b.setAttribute('onclick', "window.location='giris.html'");
      b.classList.remove('text-red-500', 'hover:bg-red-50');
      b.classList.add('text-blue-600', 'hover:bg-blue-50');
    });
    return null;
  }
}

// Çıkış yap (tüm sayfalardan çağrılabilir)
async function logoutUser() {
  try { await apiPost('/api/auth/logout'); } catch {}
  // Google One Tap otomatik girişini engelle
  if (window.google && google.accounts && google.accounts.id) {
    google.accounts.id.disableAutoSelect();
  }
  localStorage.removeItem('gu_user');
  localStorage.setItem('gu_just_logged_out', '1');
  window.location.href = 'giris.html';
}

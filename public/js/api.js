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

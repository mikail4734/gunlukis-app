# Günlükİş — Node.js + Express + MySQL Uygulaması

Tüm HTML sayfaları (`index`, `is-detay`, `is-ver`, `profil`, `takvim`, `mesaj`, `anket`) tek bir MySQL veritabanına bağlı çalışır.

## Kurulum (3 adımda)

### 1) Veritabanını oluştur
```bash
mysql -u root -p < gunlukis.sql
```
Bu komut `gunlukis` veritabanını oluşturur, 22 tabloyu kurar ve örnek verileri (Emre Yılmaz, Hilton, Trendyol, Ahmet Bey, anketler vb.) ekler.

### 2) Ayar dosyasını oluştur
```bash
cp .env.example .env
```
Sonra `.env` dosyasındaki MySQL bilgilerini (DB_USER, DB_PASSWORD) kendi sistemine göre düzenle.

### 3) Bağımlılıkları kur ve sunucuyu başlat
```bash
npm install
npm start
```

Tarayıcıdan aç: **http://localhost:3000/index.html**

## Sayfalar

| Sayfa             | URL                              | Backend Endpoint                       |
|-------------------|----------------------------------|----------------------------------------|
| Ana sayfa         | `/index.html`                    | `GET /api/jobs` (filtreler dahil)      |
| İlan detayı       | `/is-detay.html?id=1`            | `GET /api/jobs/:id` + apply/bookmark   |
| İlan ver          | `/is-ver.html`                   | `POST /api/jobs` + kategoriler         |
| Profil            | `/profil.html`                   | `GET /api/profile` + `PUT /api/profile`|
| Mesajlar          | `/mesaj.html`                    | `/api/messages/conversations[/:id]`    |
| Takvim            | `/takvim.html`                   | `/api/calendar/events` + pending       |
| Anketler          | `/anket.html`                    | `/api/surveys` + submit                |

## Auth (opsiyonel)
Demo amacıyla `.env`'deki `DEMO_USER_ID=1` (Emre Yılmaz) varsayılan aktif kullanıcıdır.
Gerçek giriş için:
- `POST /api/auth/register` — `{full_name, email, password, phone?, role?}`
- `POST /api/auth/login`    — `{email, password}`
- `POST /api/auth/logout`
- `GET  /api/auth/me`

Örnek demo girişi (önce SQL'deki örnek kullanıcının şifresini bcrypt ile güncelle, ya da `register` ile yeni kullanıcı oluştur).

## Proje Yapısı
```
gunlukis-app/
├── server.js            # Express ana giriş
├── package.json
├── .env.example
├── gunlukis.sql         # MySQL şeması + örnek veri
├── config/
│   └── db.js            # MySQL connection pool
├── routes/
│   ├── auth.js          # /api/auth/*
│   ├── jobs.js          # /api/jobs/*
│   ├── profile.js       # /api/profile/*
│   ├── messages.js      # /api/messages/*
│   ├── calendar.js      # /api/calendar/*
│   └── surveys.js       # /api/surveys/*
└── public/              # Statik HTML/JS/CSS
    ├── index.html
    ├── is-detay.html
    ├── is-ver.html
    ├── profil.html
    ├── takvim.html
    ├── mesaj.html
    ├── anket.html
    └── js/
        └── api.js       # Ortak API helper (apiGet/Post/Put/Delete)
```

## Sorun Giderme
- **MySQL bağlantı hatası**: `.env` dosyasındaki DB_USER ve DB_PASSWORD doğru mu? MySQL servisi çalışıyor mu? (`sudo service mysql start`)
- **Türkçe karakter bozuluyor**: Veritabanı `utf8mb4` ile oluşturuldu, MySQL client'ı da utf8mb4 kullanmalı.
- **Port 3000 dolu**: `.env`'deki `PORT` değerini değiştir (örn. 3001).

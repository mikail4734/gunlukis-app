// server.js — Ana sunucu
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'gunlukis-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 24 * 7 } // 1 hafta
}));

// Statik dosyalar (HTML sayfaları)
app.use(express.static(path.join(__dirname, 'public')));

// API rotaları
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/jobs',     require('./routes/jobs'));
app.use('/api/profile',  require('./routes/profile'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/calendar', require('./routes/calendar'));
app.use('/api/surveys',  require('./routes/surveys'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/social',   require('./routes/social'));

// Sağlık kontrolü
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date() }));

// 404 (API için)
app.use('/api/*', (req, res) => res.status(404).json({ error: 'Endpoint bulunamadı' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✓ Günlükİş sunucusu http://localhost:${PORT} adresinde çalışıyor`);
  console.log(`  Ana sayfa: http://localhost:${PORT}/index.html`);
});

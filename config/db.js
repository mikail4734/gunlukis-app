// config/db.js — MySQL bağlantı havuzu
const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 3306,
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'gunlukis',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  dateStrings: true,
});

// Bağlantıyı başlangıçta test et
pool.getConnection()
  .then(conn => {
    console.log('✓ MySQL bağlantısı başarılı:', process.env.DB_NAME);
    conn.release();
  })
  .catch(err => {
    console.error('✗ MySQL bağlantı hatası:', err.message);
  });

module.exports = pool;

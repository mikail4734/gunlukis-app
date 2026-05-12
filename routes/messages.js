// routes/messages.js — Mesajlaşma (1-1 + GRUP + dosya/resim + arama)
const router = require("express").Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require("../config/db");

const currentUserId = (req) =>
  req.session.userId || process.env.DEMO_USER_ID || 1;

// ==== Dosya yükleme (multer) ====
const uploadDir = path.join(__dirname, "..", "public", "uploads", "messages");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + "-" + safe);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// ============================================================
// SOHBET LİSTESİ (arama destekli, gruplar dahil)
// GET /api/messages/conversations?q=arama_metni
// ============================================================
router.get("/conversations", async (req, res) => {
  try {
    const uid = currentUserId(req);
    const q = (req.query.q || "").trim();

    let sql = `
      SELECT c.id, c.is_group, c.group_name, c.group_avatar, c.last_message_at AS time,

        (SELECT cp2.user_id FROM conversation_participants cp2
         WHERE cp2.conversation_id = c.id AND cp2.user_id <> ?
         LIMIT 1) AS other_user_id,

        CASE WHEN c.is_group = 1 THEN c.group_name
             ELSE (SELECT u.full_name FROM conversation_participants cp2
                   JOIN users u ON u.id = cp2.user_id
                   WHERE cp2.conversation_id = c.id AND cp2.user_id <> ? LIMIT 1)
        END AS name,

        CASE WHEN c.is_group = 1 THEN c.group_avatar
             ELSE (SELECT u.avatar_url FROM conversation_participants cp2
                   JOIN users u ON u.id = cp2.user_id
                   WHERE cp2.conversation_id = c.id AND cp2.user_id <> ? LIMIT 1)
        END AS avatar,

        CASE WHEN c.is_group = 1 THEN 0
             ELSE (SELECT u.is_online FROM conversation_participants cp2
                   JOIN users u ON u.id = cp2.user_id
                   WHERE cp2.conversation_id = c.id AND cp2.user_id <> ? LIMIT 1)
        END AS online,

        (SELECT COUNT(*) FROM conversation_participants WHERE conversation_id = c.id) AS member_count,

        (SELECT
            CASE WHEN m.message_type = 'image' THEN '📷 Fotoğraf'
                 WHEN m.message_type = 'file'  THEN '📎 Dosya'
                 ELSE m.content END
         FROM messages m WHERE m.conversation_id = c.id
         ORDER BY m.sent_at DESC LIMIT 1) AS last_message,

        (SELECT COUNT(*) FROM messages m
         WHERE m.conversation_id = c.id AND m.sender_id <> ? AND m.is_read = 0) AS unread

      FROM conversations c
      INNER JOIN conversation_participants cp ON cp.conversation_id = c.id
      WHERE cp.user_id = ?
    `;
    const params = [uid, uid, uid, uid, uid, uid];

    if (q) {
      sql += ` HAVING name LIKE ? OR last_message LIKE ?`;
      params.push(`%${q}%`, `%${q}%`);
    }
    sql += " ORDER BY c.last_message_at DESC";

    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// SOHBET MESAJLARI
// ============================================================
router.get("/conversations/:id", async (req, res) => {
  try {
    const uid = currentUserId(req);
    const convId = req.params.id;

    const [perm] = await db.query(
      "SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?",
      [convId, uid],
    );
    if (perm.length === 0)
      return res.status(403).json({ error: "Bu sohbete erişimin yok" });

    const [msgs] = await db.query(
      `
      SELECT m.id, m.sender_id, m.content, m.message_type, m.file_url, m.file_name, m.file_size,
             m.sent_at, m.is_read,
             u.full_name AS sender_name, u.avatar_url AS sender_avatar,
             CASE WHEN m.sender_id = ? THEN 'me' ELSE 'them' END AS sender
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = ?
      ORDER BY m.sent_at ASC`,
      [uid, convId],
    );

    await db.query(
      `
      UPDATE messages SET is_read = 1, read_at = NOW()
      WHERE conversation_id = ? AND sender_id <> ? AND is_read = 0`,
      [convId, uid],
    );

    res.json(msgs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// SOHBET DETAYI (grup bilgisi, üyeler)
// ============================================================
router.get("/conversations/:id/info", async (req, res) => {
  try {
    const uid = currentUserId(req);
    const convId = req.params.id;

    const [convs] = await db.query(
      `
      SELECT c.id, c.is_group, c.group_name, c.group_avatar, c.created_by, c.created_at
      FROM conversations c WHERE c.id = ?`,
      [convId],
    );
    if (convs.length === 0)
      return res.status(404).json({ error: "Sohbet yok" });

    const [members] = await db.query(
      `
      SELECT u.id, u.full_name, u.avatar_url, u.is_online, u.title, cp.role
      FROM conversation_participants cp
      JOIN users u ON u.id = cp.user_id
      WHERE cp.conversation_id = ?
      ORDER BY (cp.role = 'admin') DESC, u.full_name`,
      [convId],
    );

    const isMember = members.some((m) => m.id == uid);
    if (!isMember)
      return res.status(403).json({ error: "Bu sohbete erişimin yok" });

    res.json({ conversation: convs[0], members });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// METİN MESAJI GÖNDER
// ============================================================
router.post("/conversations/:id/messages", async (req, res) => {
  try {
    const uid = currentUserId(req);
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Boş mesaj gönderilemez" });
    }

    const [perm] = await db.query(
      "SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?",
      [req.params.id, uid],
    );
    if (perm.length === 0) return res.status(403).json({ error: "Erişim yok" });

    const [r] = await db.query(
      `INSERT INTO messages (conversation_id, sender_id, content, message_type) VALUES (?, ?, ?, 'text')`,
      [req.params.id, uid, content],
    );
    await db.query(
      `UPDATE conversations SET last_message_at = NOW() WHERE id = ?`,
      [req.params.id],
    );
    res.json({ success: true, id: r.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// DOSYA / RESİM GÖNDER (multipart/form-data)
// ============================================================
router.post(
  "/conversations/:id/upload",
  upload.single("file"),
  async (req, res) => {
    try {
      const uid = currentUserId(req);
      if (!req.file) return res.status(400).json({ error: "Dosya yok" });

      const [perm] = await db.query(
        "SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?",
        [req.params.id, uid],
      );
      if (perm.length === 0) {
        fs.unlinkSync(req.file.path);
        return res.status(403).json({ error: "Erişim yok" });
      }

      const isImage = req.file.mimetype.startsWith("image/");
      const messageType = isImage ? "image" : "file";
      const fileUrl = "/uploads/messages/" + req.file.filename;

      const [r] = await db.query(
        `
      INSERT INTO messages
        (conversation_id, sender_id, content, message_type, file_url, file_name, file_size)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          req.params.id,
          uid,
          req.body.caption || null,
          messageType,
          fileUrl,
          req.file.originalname,
          req.file.size,
        ],
      );

      await db.query(
        `UPDATE conversations SET last_message_at = NOW() WHERE id = ?`,
        [req.params.id],
      );

      res.json({
        success: true,
        id: r.insertId,
        message_type: messageType,
        file_url: fileUrl,
        file_name: req.file.originalname,
        file_size: req.file.size,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ============================================================
// KULLANICI ARAMA (grup üyesi eklerken)
// ============================================================
router.get("/users/search", async (req, res) => {
  try {
    const uid = currentUserId(req);
    const q = (req.query.q || "").trim();
    if (q.length < 1) return res.json([]);

    const [rows] = await db.query(
      `
      SELECT id, full_name, avatar_url, title, is_online
      FROM users
      WHERE id <> ? AND status = 'active' AND full_name LIKE ?
      ORDER BY full_name LIMIT 20`,
      [uid, `%${q}%`],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GRUP OLUŞTUR
// ============================================================
router.post("/groups", async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const uid = currentUserId(req);
    const { name, member_ids } = req.body;

    if (!name || !name.trim()) {
      await conn.rollback();
      return res.status(400).json({ error: "Grup adı zorunlu" });
    }
    if (!Array.isArray(member_ids) || member_ids.length < 1) {
      await conn.rollback();
      return res.status(400).json({ error: "En az 1 üye seçmelisin" });
    }

    const [r] = await conn.query(
      `INSERT INTO conversations (is_group, group_name, created_by, last_message_at, user1_id)
       VALUES (1, ?, ?, NOW(), ?)`,
      [name.trim(), uid, uid],
    );
    const convId = r.insertId;

    const members = new Set([
      parseInt(uid),
      ...member_ids.map((x) => parseInt(x)),
    ]);
    for (const memberId of members) {
      await conn.query(
        `INSERT INTO conversation_participants (conversation_id, user_id, role)
         VALUES (?, ?, ?)`,
        [convId, memberId, memberId == uid ? "admin" : "member"],
      );
    }

    await conn.query(
      `INSERT INTO messages (conversation_id, sender_id, content, message_type)
       VALUES (?, ?, ?, 'text')`,
      [convId, uid, `Grup oluşturuldu: ${name.trim()}`],
    );

    await conn.commit();
    res.json({ success: true, id: convId });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ============================================================
// SOHBETİ SİL / GRUPTAN AYRIL
// ============================================================
router.delete("/conversations/:id", async (req, res) => {
  try {
    const uid = currentUserId(req);
    const [convs] = await db.query(
      "SELECT is_group FROM conversations WHERE id = ?",
      [req.params.id],
    );
    if (convs.length === 0)
      return res.status(404).json({ error: "Sohbet yok" });

    if (convs[0].is_group == 1) {
      await db.query(
        "DELETE FROM conversation_participants WHERE conversation_id = ? AND user_id = ?",
        [req.params.id, uid],
      );
      const [left] = await db.query(
        "SELECT COUNT(*) AS cnt FROM conversation_participants WHERE conversation_id = ?",
        [req.params.id],
      );
      if (left[0].cnt === 0) {
        await db.query("DELETE FROM conversations WHERE id = ?", [
          req.params.id,
        ]);
      }
      return res.json({ success: true, left: true });
    }

    await db.query("DELETE FROM conversations WHERE id = ?", [req.params.id]);
    res.json({ success: true, deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

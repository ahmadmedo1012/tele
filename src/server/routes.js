import { getDb } from './db.js';
import { v4 as uuid } from 'uuid';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { broadcastToChat } from './ws.js';
import { generateToken } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const AVATAR_MAX_SIZE = 2 * 1024 * 1024; // 2MB
const FILE_MAX_SIZE = 50 * 1024 * 1024;  // 50MB
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
  'text/plain', 'application/zip', 'audio/mpeg', 'audio/ogg', 'video/mp4'];

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../uploads/'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `${uuid()}${ext}`);
  }
});

function fileFilter(req, file, cb) {
  if (file.fieldname === 'avatar') {
    if (!file.mimetype.startsWith('image/')) { cb(new Error('Avatar must be an image')); return; }
    if (file.size > AVATAR_MAX_SIZE) { cb(new Error('Avatar max 2MB')); return; }
  } else {
    if (!ALLOWED_MIMES.includes(file.mimetype) && !file.mimetype.startsWith('image/')) {
      cb(new Error(`Unsupported file type: ${file.mimetype}`)); return;
    }
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: FILE_MAX_SIZE }
});

function sanitize(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/[<>]/g, '').trim().substring(0, 5000);
}

export function setupRoutes(app) {
  // Token refresh
  app.post('/api/refresh', (req, res) => {
    const token = generateToken(req.user);
    res.json({ token });
  });

  // Users
  app.get('/api/users', (req, res) => {
    const db = getDb();
    const users = db.prepare('SELECT id, username, display_name, avatar, bio, status, status_text, phone FROM users WHERE id != ? ORDER BY display_name ASC').all(req.user.id);
    res.json(users);
  });

  app.get('/api/users/:id', (req, res) => {
    const db = getDb();
    const u = db.prepare('SELECT id, username, display_name, avatar, bio, status, status_text, phone FROM users WHERE id = ?').get(req.params.id);
    if (!u) return res.status(404).json({ error: 'Not found' });
    res.json(u);
  });

  app.put('/api/profile', (req, res, next) => {
    upload.single('avatar')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      const db = getDb();
      const { display_name, bio, status_text, status, theme, lang, phone } = req.body;
      const avatar = req.file ? `/uploads/${req.file.filename}` : undefined;
      const updates = [];
      const vals = [];
      if (display_name !== undefined) { const v = sanitize(display_name).substring(0, 50); updates.push('display_name = ?'); vals.push(v || 'User'); }
      if (bio !== undefined) { updates.push('bio = ?'); vals.push(sanitize(bio).substring(0, 300)); }
      if (phone !== undefined) { updates.push('phone = ?'); vals.push(sanitize(phone).substring(0, 20)); }
      if (avatar) { updates.push('avatar = ?'); vals.push(avatar); }
      if (status_text !== undefined) { updates.push('status_text = ?'); vals.push(sanitize(status_text).substring(0, 100)); }
      if (status !== undefined) { updates.push('status = ?'); vals.push(status); }
      if (theme !== undefined && ['dark', 'light'].includes(theme)) { updates.push('theme = ?'); vals.push(theme); }
      if (lang !== undefined && ['ltr', 'rtl'].includes(lang)) { updates.push('lang = ?'); vals.push(lang); }
      if (updates.length) {
        updates.push("updated_at = datetime('now')");
        db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...vals, req.user.id);
      }
      res.json({ ok: true });
    });
  });

  app.get('/api/profile', (req, res) => {
    const db = getDb();
    const u = db.prepare('SELECT id, username, display_name, avatar, bio, status, status_text, phone, theme, lang FROM users WHERE id = ?').get(req.user.id);
    res.json(u);
  });

  // Chats
  app.get('/api/chats', (req, res) => {
    const db = getDb();
    const { archived } = req.query;
    let where = archived === '1' ? 'AND c.is_archived = 1' : 'AND (c.is_archived IS NULL OR c.is_archived = 0)';

    const chats = db.prepare(`
      SELECT c.*,
        (SELECT json_group_array(json_object('id', u.id, 'username', u.username, 'display_name', u.display_name, 'avatar', u.avatar))
         FROM chat_participants cp2 JOIN users u ON u.id = cp2.user_id WHERE cp2.chat_id = c.id) as participants_json,
        (SELECT json_object('id', m.id, 'content', substr(m.content,1,100), 'created_at', m.created_at, 'sender_id', m.sender_id,
           'sender_name', u2.display_name, 'file_type', m.file_type, 'file_name', m.file_name)
         FROM messages m LEFT JOIN users u2 ON u2.id = m.sender_id WHERE m.chat_id = c.id AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT 1) as last_message_json,
        (SELECT COUNT(*) FROM messages m WHERE m.chat_id = c.id
          AND m.deleted_at IS NULL
          AND m.sender_id != ?
          AND (m.created_at > COALESCE((SELECT MAX(msg2.created_at) FROM messages msg2 WHERE msg2.chat_id = c.id AND msg2.sender_id = ?), '1970-01-01'))
        ) as unread
      FROM chats c
      WHERE c.id IN (SELECT chat_id FROM chat_participants WHERE user_id = ?)
      ${where}
      ORDER BY c.is_pinned DESC, COALESCE(c.last_message_at, c.created_at) DESC
    `).all(req.user.id, req.user.id, req.user.id);

    res.json(chats.map(c => ({
      ...c,
      participants: JSON.parse(c.participants_json || '[]'),
      last_message: JSON.parse(c.last_message_json || 'null'),
    })));
  });

  app.post('/api/chats', (req, res) => {
    const db = getDb();
    const { type, name, user_ids } = req.body;
    if (!type || !['private', 'group'].includes(type)) return res.status(400).json({ error: 'Invalid chat type' });
    if (!user_ids || !Array.isArray(user_ids) || !user_ids.length) return res.status(400).json({ error: 'user_ids required' });
    if (user_ids.length > 100) return res.status(400).json({ error: 'Max 100 participants' });
    if (name && name.length > 100) return res.status(400).json({ error: 'Name too long' });

    if (type === 'private') {
      const otherId = user_ids[0];
      const existing = db.prepare(`
        SELECT c.id FROM chats c
        JOIN chat_participants cp1 ON cp1.chat_id = c.id AND cp1.user_id = ?
        JOIN chat_participants cp2 ON cp2.chat_id = c.id AND cp2.user_id = ?
        WHERE c.type = 'private'
      `).get(req.user.id, otherId);
      if (existing) return res.json({ id: existing.id, existing: true });
    }

    const chatId = uuid();
    const safeName = name ? sanitize(name).substring(0, 100) : null;
    db.prepare('INSERT INTO chats (id, type, name, created_by) VALUES (?,?,?,?)').run(chatId, type, safeName, req.user.id);
    const cp = db.prepare('INSERT OR IGNORE INTO chat_participants (chat_id, user_id, role) VALUES (?,?,?)');
    cp.run(chatId, req.user.id, 'owner');
    for (const uid of user_ids) {
      cp.run(chatId, uid, type === 'group' ? 'member' : 'member');
    }
    res.json({ id: chatId, existing: false });
  });

  app.put('/api/chats/:id', (req, res) => {
    const db = getDb();
    const { name, is_archived, is_pinned } = req.body;

    // Verify membership
    const member = db.prepare('SELECT 1 FROM chat_participants WHERE chat_id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!member) return res.status(403).json({ error: 'Not a participant' });

    const sets = []; const vals = [];
    if (name !== undefined) { const v = sanitize(name).substring(0, 100); sets.push('name = ?'); vals.push(v); }
    if (is_archived !== undefined) { sets.push('is_archived = ?'); vals.push(is_archived ? 1 : 0); }
    if (is_pinned !== undefined) { sets.push('is_pinned = ?'); vals.push(is_pinned ? 1 : 0); }
    if (sets.length) {
      db.prepare(`UPDATE chats SET ${sets.join(', ')} WHERE id = ?`).run(...vals, req.params.id);
    }
    res.json({ ok: true });
  });

  app.get('/api/chats/:id/participants', (req, res) => {
    const db = getDb();
    const ps = db.prepare(`SELECT u.id, u.username, u.display_name, u.avatar, u.status, cp.role
      FROM chat_participants cp JOIN users u ON u.id = cp.user_id WHERE cp.chat_id = ?`).all(req.params.id);
    res.json(ps);
  });

  app.post('/api/chats/:id/participants', (req, res) => {
    const db = getDb();
    const { user_ids } = req.body;
    if (!user_ids || !Array.isArray(user_ids)) return res.status(400).json({ error: 'user_ids required' });
    const cp = db.prepare('INSERT OR IGNORE INTO chat_participants (chat_id, user_id, role) VALUES (?,?,?)');
    for (const uid of user_ids) cp.run(req.params.id, uid, 'member');
    res.json({ ok: true });
  });

  app.delete('/api/chats/:id/participants/:userId', (req, res) => {
    const db = getDb();
    db.prepare('DELETE FROM chat_participants WHERE chat_id = ? AND user_id = ?').run(req.params.id, req.params.userId);
    res.json({ ok: true });
  });

  // Messages
  app.get('/api/chats/:id/messages', (req, res) => {
    const db = getDb();
    const { before, limit = 50, after } = req.query;
    const lim = Math.min(parseInt(limit) || 50, 200);

    // Check clear history
    const clear = db.prepare('SELECT cleared_before FROM chat_clear WHERE chat_id = ? AND user_id = ?').get(req.params.id, req.user.id);
    const clearCond = clear ? `AND m.created_at > '${clear.cleared_before}'` : '';

    let query = `SELECT m.*, u.display_name as sender_name, u.avatar as sender_avatar,
      (SELECT json_group_array(json_object('emoji', mr.emoji, 'user_id', mr.user_id))
       FROM message_reactions mr WHERE mr.message_id = m.id) as reactions_json
      FROM messages m JOIN users u ON u.id = m.sender_id
      WHERE m.chat_id = ? AND m.deleted_at IS NULL ${clearCond}`;
    const params = [req.params.id];

    if (before) { query += ' AND m.created_at < ?'; params.push(before); }
    if (after) {
      query = query.replace('ORDER BY m.created_at DESC', 'ORDER BY m.created_at ASC');
      query += ' AND m.created_at > ?';
      params.push(after);
      query += ' ORDER BY m.created_at ASC LIMIT ?';
    } else {
      query += ' ORDER BY m.created_at DESC LIMIT ?';
    }
    params.push(lim);
    const msgs = db.prepare(query).all(...params);

    const result = msgs.map(m => ({
      ...m,
      reactions: JSON.parse(m.reactions_json || '[]'),
    }));

    // If loading older messages (before), reverse them
    if (before) result.reverse();

    res.json(result);
  });

  app.post('/api/chats/:id/messages', (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      const db = getDb();
      const { content, reply_to } = req.body;
      const id = uuid();
      const file = req.file;

      const member = db.prepare('SELECT 1 FROM chat_participants WHERE chat_id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (!member) return res.status(403).json({ error: 'Not a participant' });

      // Validate reply_to exists
      if (reply_to) {
        const replied = db.prepare('SELECT id FROM messages WHERE id = ? AND chat_id = ?').get(reply_to, req.params.id);
        if (!replied) return res.status(400).json({ error: 'Message to reply to not found' });
      }

      const safeContent = content ? sanitize(content).substring(0, 5000) : null;
      db.prepare(`INSERT INTO messages (id, chat_id, sender_id, content, reply_to, file_path, file_type, file_name, file_size)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(id, req.params.id, req.user.id, safeContent, reply_to || null,
        file ? `/uploads/${file.filename}` : null, file ? file.mimetype : null, file ? file.originalname : null, file ? file.size : null);
      db.prepare("UPDATE chats SET last_message_at = datetime('now') WHERE id = ?").run(req.params.id);
      const msg = db.prepare(`SELECT m.*, u.display_name as sender_name, u.avatar as sender_avatar
        FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?`).get(id);
      broadcastToChat(req.params.id, { type: 'message', message: { ...msg, reactions: [] } }, req.user.id);
      res.json({ ...msg, reactions: [] });
    });
  });

  app.delete('/api/messages/:id', (req, res) => {
    const db = getDb();
    const msg = db.prepare('SELECT sender_id, chat_id FROM messages WHERE id = ?').get(req.params.id);
    if (!msg) return res.status(404).json({ error: 'Not found' });
    if (msg.sender_id !== req.user.id) return res.status(403).json({ error: 'Not your message' });
    db.prepare("UPDATE messages SET deleted_at = datetime('now') WHERE id = ? AND sender_id = ?").run(req.params.id, req.user.id);
    broadcastToChat(msg.chat_id, { type: 'message_deleted', message_id: req.params.id, chat_id: msg.chat_id }, null);
    res.json({ ok: true });
  });

  // Edit message
  app.put('/api/messages/:id', (req, res) => {
    const db = getDb();
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Content required' });
    const msg = db.prepare('SELECT sender_id, chat_id FROM messages WHERE id = ?').get(req.params.id);
    if (!msg) return res.status(404).json({ error: 'Not found' });
    if (msg.sender_id !== req.user.id) return res.status(403).json({ error: 'Not your message' });
    const safeContent = sanitize(content).substring(0, 5000);
    db.prepare("UPDATE messages SET content = ?, updated_at = datetime('now'), edited_at = datetime('now') WHERE id = ?").run(safeContent, req.params.id);
    const updated = db.prepare('SELECT m.*, u.display_name as sender_name, u.avatar as sender_avatar FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?').get(req.params.id);
    broadcastToChat(msg.chat_id, { type: 'message_edited', message: { ...updated, reactions: [] } }, null);
    res.json({ ...updated, reactions: [] });
  });

  // Clear chat history
  app.post('/api/chats/:id/clear', (req, res) => {
    const db = getDb();
    const member = db.prepare('SELECT 1 FROM chat_participants WHERE chat_id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!member) return res.status(403).json({ error: 'Not a participant' });
    db.prepare('INSERT OR REPLACE INTO chat_clear (chat_id, user_id, cleared_before) VALUES (?,?,datetime(\'now\'))')
      .run(req.params.id, req.user.id);
    res.json({ ok: true });
  });

  // Reactions
  app.post('/api/messages/:id/react', (req, res) => {
    const db = getDb();
    const { emoji } = req.body;
    if (!emoji || typeof emoji !== 'string' || emoji.length > 10) return res.status(400).json({ error: 'Invalid emoji' });
    const msg = db.prepare('SELECT chat_id FROM messages WHERE id = ?').get(req.params.id);
    if (!msg) return res.status(404).json({ error: 'Not found' });
    try {
      db.prepare('INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?,?,?)').run(req.params.id, req.user.id, emoji);
    } catch {
      // Already exists — toggle it off
      db.prepare('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?').run(req.params.id, req.user.id, emoji);
    }
    const reactions = db.prepare('SELECT emoji, user_id FROM message_reactions WHERE message_id = ?').all(req.params.id);
    broadcastToChat(msg.chat_id, { type: 'reaction', message_id: req.params.id, chat_id: msg.chat_id, reactions }, null);
    res.json({ reactions });
  });

  // Search
  app.get('/api/search', (req, res) => {
    const db = getDb();
    const { q } = req.query;
    if (!q || q.trim().length === 0) return res.json({ messages: [], chats: [] });
    const query = `%${sanitize(q).substring(0, 200)}%`;

    const chats = db.prepare(`
      SELECT c.id, c.name, c.type,
        (SELECT u.display_name FROM chat_participants cp2 JOIN users u ON u.id = cp2.user_id
         WHERE cp2.chat_id = c.id AND cp2.user_id != ? LIMIT 1) as display_name
      FROM chats c JOIN chat_participants cp ON cp.chat_id = c.id
      WHERE cp.user_id = ? AND (c.name LIKE ? OR c.id IN (
        SELECT chat_id FROM messages WHERE content LIKE ? AND deleted_at IS NULL GROUP BY chat_id
      )) GROUP BY c.id LIMIT 20
    `).all(req.user.id, req.user.id, query, query);

    const messages = db.prepare(`
      SELECT m.*, u.display_name as sender_name, c.type as chat_type, c.name as chat_name
      FROM messages m JOIN users u ON u.id = m.sender_id
      JOIN chats c ON c.id = m.chat_id
      JOIN chat_participants cp ON cp.chat_id = m.chat_id AND cp.user_id = ?
      WHERE m.content LIKE ? AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT 50
    `).all(req.user.id, query);

    res.json({ messages, chats });
  });
}

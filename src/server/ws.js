import { WebSocketServer } from 'ws';
import { authWs } from './auth.js';
import { getDb } from './db.js';
import { v4 as uuid } from 'uuid';

const chatClients = new Map(); // chatId -> Map(userId -> ws)
const userSockets = new Map(); // userId -> Set(ws)

export function addClient(chatId, userId, ws) {
  if (!chatClients.has(chatId)) chatClients.set(chatId, new Map());
  chatClients.get(chatId).set(userId, ws);
}

export function removeClient(chatId, userId) {
  const clients = chatClients.get(chatId);
  if (clients) {
    clients.delete(userId);
    if (!clients.size) chatClients.delete(chatId);
  }
}

export function broadcastToChat(chatId, data, excludeUserId) {
  const clients = chatClients.get(chatId);
  if (!clients) return;
  const msg = JSON.stringify(data);
  for (const [uid, ws] of clients) {
    if (uid !== excludeUserId && ws.readyState === 1) ws.send(msg);
  }
}

function broadcastStatus(userId, status, statusText) {
  const msg = JSON.stringify({ type: 'status', user_id: userId, status, status_text: statusText || '' });
  for (const clients of chatClients.values()) {
    for (const [, ws] of clients) {
      if (ws.readyState === 1) ws.send(msg);
    }
  }
}

function hasOtherSockets(userId, currentWs) {
  const sockets = userSockets.get(userId);
  if (!sockets) return false;
  for (const ws of sockets) {
    if (ws !== currentWs && ws.readyState === 1) return true;
  }
  return false;
}

export function setupWebSocket(server) {
  const wss = new WebSocketServer({ server, verifyClient: authWs });

  wss.on('connection', (ws, req) => {
    const user = req.user;
    const db = getDb();

    // Track socket
    if (!userSockets.has(user.id)) userSockets.set(user.id, new Set());
    userSockets.get(user.id).add(ws);

    db.prepare("UPDATE users SET status = 'online' WHERE id = ?").run(user.id);
    broadcastStatus(user.id, 'online');

    ws.on('message', (raw) => {
      try {
        handleMessage(JSON.parse(raw.toString()), user.id, ws);
      } catch { /* ignore malformed */ }
    });

    ws.on('close', () => {
      userSockets.get(user.id)?.delete(ws);
      if (!hasOtherSockets(user.id, ws)) {
        db.prepare("UPDATE users SET status = 'offline' WHERE id = ?").run(user.id);
        broadcastStatus(user.id, 'offline');
      }
      // Clean up chat room memberships
      for (const [chatId, clients] of chatClients.entries()) {
        if (clients.has(user.id)) removeClient(chatId, user.id);
      }
    });

    // Send online status of all users
    ws.send(JSON.stringify({
      type: 'online_users',
      users: db.prepare("SELECT id, username, display_name, status, status_text, avatar FROM users").all()
    }));
  });
}

function handleMessage(data, userId, ws) {
  const db = getDb();
  switch (data.type) {
    case 'join_chat':
      addClient(data.chat_id, userId, ws);
      break;
    case 'leave_chat':
      removeClient(data.chat_id, userId);
      break;
    case 'typing':
      broadcastToChat(data.chat_id, { type: 'typing', user_id: userId, chat_id: data.chat_id }, userId);
      break;
    case 'stop_typing':
      broadcastToChat(data.chat_id, { type: 'stop_typing', user_id: userId, chat_id: data.chat_id }, userId);
      break;
    case 'message': {
      const { chat_id, content, reply_to } = data;
      const safeContent = content ? String(content).replace(/[<>]/g, '').trim().substring(0, 5000) : null;
      if (!safeContent) { ws.send(JSON.stringify({ type: 'error', message: 'Empty message' })); return; }
      const id = uuid();
      db.prepare('INSERT INTO messages (id, chat_id, sender_id, content, reply_to) VALUES (?,?,?,?,?)')
        .run(id, chat_id, userId, safeContent, reply_to || null);
      db.prepare("UPDATE chats SET last_message_at = datetime('now') WHERE id = ?").run(chat_id);
      const msg = db.prepare(`SELECT m.*, u.display_name as sender_name, u.avatar as sender_avatar
        FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?`).get(id);
      broadcastToChat(chat_id, { type: 'message', message: { ...msg, reactions: [] } }, userId);
      ws.send(JSON.stringify({ type: 'message_ack', message: { ...msg, reactions: [] } }));
      break;
    }
    case 'update_status':
      db.prepare("UPDATE users SET status = ?, status_text = ? WHERE id = ?")
        .run(data.status || 'online', data.status_text || '', userId);
      broadcastStatus(userId, data.status || 'online', data.status_text);
      break;
  }
}

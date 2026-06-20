import { state } from './state.js';

let ws = null;
let reconnectTimer = null;
const listeners = {};

export function on(event, fn) {
  if (!listeners[event]) listeners[event] = [];
  listeners[event].push(fn);
}

export function off(event, fn) {
  if (!listeners[event]) return;
  listeners[event] = listeners[event].filter(f => f !== fn);
}

function emit(event, data) {
  (listeners[event] || []).forEach(fn => fn(data));
}

export function connect() {
  if (ws) return;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${proto}//${location.host}/ws?token=${state.token}`;
  ws = new WebSocket(url);

  ws.onopen = () => { reconnectTimer = null; };

  ws.onmessage = (e) => {
    try {
      handleMessage(JSON.parse(e.data));
    } catch {}
  };

  ws.onclose = () => {
    ws = null;
    if (state.user && state.token) {
      emit('offline', state.user.id);
      reconnectTimer = setTimeout(connect, 3000);
    }
  };
}

export function disconnect() {
  clearTimeout(reconnectTimer);
  if (ws) { ws.onclose = null; ws.close(); ws = null; }
}

export function send(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function handleMessage(data) {
  switch (data.type) {
    case 'online_users':
      const map = {};
      (data.users || []).forEach(u => { map[u.id] = u; });
      state.onlineUsers = map;
      emit('online_users', map);
      break;
    case 'status':
      state.onlineUsers[data.user_id] = state.onlineUsers[data.user_id] || {};
      state.onlineUsers[data.user_id].status = data.status;
      state.onlineUsers[data.user_id].status_text = data.status_text;
      emit('status', data);
      break;
    case 'message':
      emit('message', data.message);
      break;
    case 'message_ack':
      emit('message_ack', data.message);
      break;
    case 'message_deleted':
      emit('message_deleted', data);
      break;
    case 'message_edited':
      emit('message_edited', data.message);
      break;
    case 'reaction':
      emit('reaction', data);
      break;
    case 'typing':
      state.typingUsers[data.chat_id] = state.typingUsers[data.chat_id] || {};
      state.typingUsers[data.chat_id][data.user_id] = Date.now();
      emit('typing', data);
      break;
    case 'stop_typing':
      if (state.typingUsers[data.chat_id]) {
        delete state.typingUsers[data.chat_id][data.user_id];
      }
      emit('stop_typing', data);
      break;
  }
}

export { send as wsSend };

/* ── Notifications & Title badge ── */
import { state } from '../js/state.js';

export function updateTitleBadge() {
  const total = state.chats.reduce((s, c) => s + (c.unread || 0), 0);
  document.title = total > 0 ? `(${total > 99 ? '99+' : total}) Tele` : 'Tele — Messenger';
}

// Set by main.js to avoid circular dependency with chat.js
export let openChatFn = null;
export function setOpenChatFn(fn) { openChatFn = fn; }

export function notifyMessage(msg) {
  if (!msg || msg.sender_id === state.user?.id) return;
  if (state.currentChat && msg.chat_id === state.currentChat.id) return;
  if (navigator.vibrate) navigator.vibrate(60);
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const n = new Notification('Tele', {
    body: `${msg.sender_name}: ${(msg.content || '').substring(0, 100) || '📎 File'}`,
    icon: '/favicon.ico',
    silent: true,
  });
  n.onclick = () => {
    window.focus();
    if (msg.chat_id && openChatFn) {
      const c = state.chats.find(x => x.id === msg.chat_id);
      if (c) openChatFn(c.id);
    }
  };
  setTimeout(() => n.close(), 4000);
}

/* ═══════════════════════════════════════════════════
   TELE — Premium Messenger Client v3.0
   Bootstrap & Orchestration
   ═══════════════════════════════════════════════════ */
import { setToken } from './js/api.js';
import { state, loadAuth } from './js/state.js';
import { connect, on } from './js/ws.js';
import { show } from './js/dom.js';
import { closeModal, closeMenu } from './utils/modals.js';
import { updateTitleBadge, notifyMessage, setOpenChatFn as setNotifOpenChatFn } from './utils/notifications.js';

import { showAuth, setInitAppFn } from './views/auth.js';
import { renderSidebar, loadChats, renderChatList, triggerCloseSearch,
         setOpenChatFn as setSbOpenChatFn } from './views/sidebar.js';
import { renderMain, openChat, addMessageToView, updateMessageInView, updateMessageReactions,
         showTyping, hideTyping, setLoadChatsFn as setChatLoadChatsFn, setRenderChatListFn as setChatRenderChatListFn } from './views/chat.js';

/* ── Wire cross-module refs ── */
setSbOpenChatFn(openChat);
setChatLoadChatsFn(loadChats);
setChatRenderChatListFn(renderChatList);
setNotifOpenChatFn(openChat);

/* ── Boot ── */
function boot() {
  if (loadAuth()) {
    setToken(state.token);
    initApp();
  } else {
    showAuth();
  }
}

export function initApp() {
  const auth = document.getElementById('auth-screen');
  const app = document.getElementById('app-screen');
  if (auth) auth.style.display = 'none';
  if (app) app.classList.add('active');
  if (state.user?.lang === 'rtl') document.documentElement.dir = 'rtl';
  if (state.user?.theme === 'light') document.documentElement.classList.add('light-theme');
  show(document.getElementById('loading-screen'));
  connect();
  renderSidebar();
  renderMain();
  bindGlobalEvents();
  loadChats();
}

setInitAppFn(initApp);
boot();

/* ── WS Event Wiring ── */
function bindGlobalEvents() {
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { triggerCloseSearch(); closeMenu(); closeModal(); }
  });

  // Search click-outside
  document.addEventListener('click', e => {
    if (!e.target.closest('.sidebar-search')) triggerCloseSearch();
  });

  on('message', msg => {
    if (state.currentChat && msg.chat_id === state.currentChat.id) {
      addMessageToView(msg);
      state.currentChat.unread = 0;
    }
    updateTitleBadge();
    loadChats(true);
    notifyMessage(msg);
  });

  on('message_ack', msg => { addMessageToView(msg); loadChats(true); });

  on('message_deleted', d => {
    const el = document.querySelector(`.message[data-id="${d.message_id}"]`);
    if (el) el.remove();
    loadChats(true);
  });

  on('message_edited', msg => updateMessageInView(msg));
  on('reaction', d => updateMessageReactions(d.message_id, d.reactions));
  on('status', () => renderChatList());
  on('online_users', () => renderChatList());

  on('typing', d => {
    if (state.currentChat && d.chat_id === state.currentChat.id) showTyping(d.user_id);
  });

  on('stop_typing', d => {
    if (state.currentChat && d.chat_id === state.currentChat.id) hideTyping(d.user_id);
  });

  on('offline', () => renderChatList());
}

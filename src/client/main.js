/* ═══════════════════════════════════════════════════
   TELE — Premium Messenger Client v3.0
   Bootstrap & Orchestration
   ═══════════════════════════════════════════════════ */
import { api, setToken } from './js/api.js';
import { state, loadAuth } from './js/state.js';
import { connect, disconnect, on } from './js/ws.js';
import { show } from './js/dom.js';
import { toast } from './utils/toast.js';
import { closeModal, closeMenu } from './utils/modals.js';
import { updateTitleBadge, notifyMessage, setOpenChatFn as setNotifOpenChatFn } from './utils/notifications.js';

import { showAuth, setInitAppFn } from './views/auth.js';
import { renderSidebar, loadChats, renderChatList, triggerCloseSearch, triggerRenderFooter,
         setOpenChatFn as setSbOpenChatFn, setShowSettingsFn, setShowNewChatFn } from './views/sidebar.js';
import { renderMain, openChat, addMessageToView, updateMessageInView, updateMessageReactions,
         showTyping, hideTyping, toggleReaction, deleteMsg,
         setLoadChatsFn as setChatLoadChatsFn, setRenderChatListFn as setChatRenderChatListFn } from './views/chat.js';
import { showSettings, showNewChat, setOpenChatFn as setStOpenChatFn,
         setLoadChatsFn as setStLoadChatsFn, setRenderFooterFn as setStRenderFooterFn } from './views/settings.js';

/* ── Wire cross-module references ── */
setSbOpenChatFn(openChat);
setShowSettingsFn(showSettings);
setShowNewChatFn(showNewChat);
setChatLoadChatsFn(loadChats);
setChatRenderChatListFn(renderChatList);
setStLoadChatsFn(loadChats);
setStOpenChatFn(openChat);
setStRenderFooterFn(triggerRenderFooter);
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
    if (e.key === 'Escape') {
      triggerCloseSearch();
      closeMenu();
      closeModal();
    }
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

  on('message_ack', msg => {
    addMessageToView(msg);
    loadChats(true);
  });

  on('message_deleted', d => {
    const el = document.querySelector(`.message[data-id="${d.message_id}"]`);
    if (el) {
      el.style.animation = 'msgOut 0.2s ease both';
      setTimeout(() => el.remove(), 200);
    }
    loadChats(true);
  });

  on('message_edited', msg => {
    updateMessageInView(msg);
  });

  on('reaction', d => {
    updateMessageReactions(d.message_id, d.reactions);
  });

  on('status', () => { renderChatList(); });
  on('online_users', () => { renderChatList(); });

  on('typing', d => {
    if (state.currentChat && d.chat_id === state.currentChat.id) showTyping(d.user_id);
  });

  on('stop_typing', d => {
    if (state.currentChat && d.chat_id === state.currentChat.id) hideTyping(d.user_id);
  });

  on('offline', () => renderChatList());
}

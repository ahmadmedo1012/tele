/* ── Sidebar: chat list, search, footer ── */
import { state } from '../js/state.js';
import { api } from '../js/api.js';
import { disconnect } from '../js/ws.js';
import { clearAuth } from '../js/state.js';
import { escHtml, mk, formatTime } from '../js/dom.js';
import { updateTitleBadge } from '../utils/notifications.js';
import { toast } from '../utils/toast.js';

export let openChatFn = null;
export let showNewChatFn = null;
export function setOpenChatFn(fn) { openChatFn = fn; }
export function setShowNewChatFn(fn) { showNewChatFn = fn; }

let _loading = false;

export function renderSidebar() {
  const sb = document.getElementById('sidebar');
  if (!sb) return;
  sb.innerHTML = `
    <div class="sidebar-header">
      <div class="logo">
        <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
          <rect width="26" height="26" rx="8" fill="url(#logoGradient)"/>
          <path d="M8 13l5 5 6-8" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <h2>Tele</h2>
      </div>
      <div class="sidebar-actions">
        <button class="icon-btn" id="new-chat-btn" title="New Chat">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </button>
        <button class="icon-btn" id="settings-btn" title="Settings">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
      </div>
    </div>
    <div class="sidebar-search" id="sidebar-search">
      <div class="search-inner">
        <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input type="text" id="chat-search" placeholder="Search or start new chat" autocomplete="off">
      </div>
      <div class="search-results" id="search-results"></div>
    </div>
    <div class="chat-list" id="chat-list"></div>
    <div class="sidebar-footer" id="sidebar-footer"></div>
  `;
  document.getElementById('new-chat-btn').onclick = () => showNewChatFn?.();
  document.getElementById('settings-btn').onclick = () => showSettings();
  document.getElementById('chat-list').onclick = e => {
    const item = e.target.closest('.chat-item');
    if (item) openChatFn?.(item.dataset.id);
  };
  renderFooter();
  setupSearch();
}

function showSettings() {
  // Dynamic import to avoid circular dependency
  import('./settings.js').then(m => m.showSettings());
}

function renderFooter() {
  const f = document.getElementById('sidebar-footer');
  if (!f || !state.user) return;
  const u = state.user;
  const initial = (u.display_name || u.username || 'U')[0].toUpperCase();
  f.innerHTML = `
    <div class="sidebar-footer-user" id="my-profile-btn">
      <div class="chat-avatar small">${escHtml(initial)}</div>
      <div class="footer-info">
        <div class="footer-name">${escHtml(u.display_name || u.username)}</div>
        <div class="footer-status">${escHtml(u.status_text || 'Online')}</div>
      </div>
      <button class="icon-btn logout-btn" id="logout-btn" title="Logout">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>
      </button>
    </div>
  `;
  document.getElementById('logout-btn').onclick = () => { disconnect(); clearAuth(); location.reload(); };
  document.getElementById('my-profile-btn').onclick = () => showSettings();
}

function setupSearch() {
  const input = document.getElementById('chat-search');
  if (!input) return;
  let timer;
  input.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = input.value.trim();
      if (q.length < 2) { closeSearch(); return; }
      try {
        state.searchResults = await api.search(q);
        showSearchResults();
      } catch { /* */ }
    }, 300);
  };
  input.onfocus = () => { if (input.value.trim().length >= 2) showSearchResults(); };
}

document.addEventListener('click', e => {
  if (!e.target.closest('.search-inner')) closeSearch();
});

/* ── Chat list ── */
export async function loadChats(silent) {
  if (_loading) return;
  _loading = true;
  try {
    const chats = await api.getChats();
    state.chats = chats || [];
    renderChatList();
    updateTitleBadge();
    const ls = document.getElementById('loading-screen');
    if (ls) ls.style.display = 'none';
  } catch { /* */ }
  _loading = false;
}

export function renderChatList() {
  const list = document.getElementById('chat-list');
  if (!list) return;
  if (!state.chats.length) {
    list.innerHTML = `
      <div class="empty-chat-list">
        <div class="empty-chat-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </div>
        <span>No conversations yet</span>
        <span class="sub">Tap + to start a new chat</span>
      </div>`;
    return;
  }
  list.innerHTML = '';
  state.chats.forEach(c => {
    const grp = c.type === 'group';
    const other = c.participants?.find(p => p.id !== state.user?.id);
    const nm = grp ? (c.name || 'Group') : (other?.display_name || 'Unknown');
    const avatarInitial = grp ? '' : ((other?.display_name || '?')[0].toUpperCase());
    const onl = !grp && other && state.onlineUsers[other.id]?.status === 'online';
    const lm = c.last_message;
    let preview = '';
    if (lm) {
      if (lm.file_type) preview = lm.file_type.startsWith('image/') ? '📷 Photo' : '📎 File';
      else if (lm.content) preview = lm.content.substring(0, 50);
      if (lm.sender_id === state.user?.id) preview = 'You: ' + preview;
    }
    const div = mk('div', { class: 'chat-item' + (state.currentChat?.id === c.id ? ' active' : ''), 'data-id': c.id });
    div.innerHTML = `
      <div class="chat-avatar ${grp ? 'group' : ''}">${grp ? '👥' : avatarInitial}</div>
      <div class="chat-info">
        <div class="chat-name-row">
          <span class="chat-name">${escHtml(nm)}</span>
          <span class="chat-time">${lm ? formatTime(lm.created_at) : ''}</span>
        </div>
        <div class="chat-preview-row">
          <span class="chat-preview">${escHtml(preview)}</span>
          ${c.unread > 0 ? `<span class="unread-badge">${c.unread > 99 ? '99+' : c.unread}</span>` : ''}
        </div>
      </div>
      ${onl ? '<div class="online-indicator"></div>' : ''}
    `;
    list.appendChild(div);
  });
}

/* ── Search ── */
function showSearchResults() {
  const el = document.getElementById('search-results');
  if (!el || !state.searchResults) return;
  const { chats, messages } = state.searchResults;
  let h = '';
  if (chats?.length) {
    h += '<div class="sr-section">Chats</div>' + chats.map(c =>
      `<div class="search-result-item" data-id="${c.id}"><div class="sr-title">${escHtml(c.name || c.display_name || 'Chat')}</div></div>`
    ).join('');
  }
  if (messages?.length) {
    h += '<div class="sr-section">Messages</div>' + messages.slice(0, 10).map(m =>
      `<div class="search-result-item" data-id="${m.chat_id}"><div class="sr-title">${escHtml(m.sender_name)}${m.chat_name ? ' → ' + escHtml(m.chat_name) : ''}</div><div class="sr-preview">${escHtml((m.content || '').substring(0, 80))}</div></div>`
    ).join('');
  }
  el.innerHTML = h || '<div class="sr-none">No results</div>';
  el.classList.add('show');
  el.onclick = async e => {
    const item = e.target.closest('.search-result-item');
    if (item) {
      await loadChats();
      openChatFn?.(item.dataset.id);
      closeSearch();
    }
  };
}

function closeSearch() {
  const el = document.getElementById('search-results');
  if (el) el.classList.remove('show');
  state.searchResults = null;
}

export function triggerCloseSearch() { closeSearch(); }
export function triggerRenderFooter() { renderFooter(); }

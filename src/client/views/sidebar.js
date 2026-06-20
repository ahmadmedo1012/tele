/* ── Sidebar: header, chat list, search, footer ── */
import { state, clearAuth } from '../js/state.js';
import { api } from '../js/api.js';
import { disconnect } from '../js/ws.js';
import { escHtml, mk, formatTime } from '../js/dom.js';
import { updateTitleBadge } from '../utils/notifications.js';

// Set by main.js to avoid circular dependency with chat.js
export let openChatFn = null;
export let showSettingsFn = null;
export let showNewChatFn = null;
export function triggerRenderFooter() { renderFooter(); }
export function triggerCloseSearch() { closeSearch(); }
export function setOpenChatFn(fn) { openChatFn = fn; }
export function setShowSettingsFn(fn) { showSettingsFn = fn; }
export function setShowNewChatFn(fn) { showNewChatFn = fn; }

let _loading = false;

/* ── Render sidebar ── */
export function renderSidebar() {
  const sb = document.getElementById('sidebar');
  if (!sb) return;
  sb.innerHTML = `
    <div class="sidebar-header">
      <div class="logo">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <rect width="28" height="28" rx="8" fill="url(#logoGradient)"/>
          <path d="M8.5 14l5 5 7-8" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <h2>Tele</h2>
      </div>
      <div class="sidebar-actions">
        <button class="icon-btn" id="new-chat-btn" title="New Chat" aria-label="New Chat">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="10" y1="4" x2="10" y2="16"/><line x1="4" y1="10" x2="16" y2="10"/></svg>
        </button>
        <button class="icon-btn" id="settings-btn" title="Settings" aria-label="Settings">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="10" cy="10" r="2.5"/><path d="M10 1.5v2M10 16.5v2M18.5 10h-2M3.5 10h-2M15.95 4.05l-1.41 1.41M5.46 14.54l-1.41 1.41M15.95 15.95l-1.41-1.41M5.46 5.46L4.05 4.05"/></svg>
        </button>
      </div>
    </div>
    <div class="search-box">
      <input type="text" id="chat-search" placeholder="Search chats & messages…" autocomplete="off">
      <span class="search-icon">⌕</span>
      <div class="search-results" id="search-results"></div>
    </div>
    <div class="chat-list" id="chat-list"></div>
    <div class="sidebar-footer" id="sidebar-footer"></div>
  `;
  document.getElementById('new-chat-btn').onclick = () => showNewChatFn?.();
  document.getElementById('settings-btn').onclick = () => showSettingsFn?.();
  document.getElementById('chat-list').onclick = e => {
    const item = e.target.closest('.chat-item');
    if (item) openChatFn?.(item.dataset.id);
  };
  renderFooter();
  setupSearch();
}

function renderFooter() {
  const f = document.getElementById('sidebar-footer');
  if (!f || !state.user) return;
  const u = state.user;
  f.innerHTML = `
    <div class="sidebar-footer-user">
      <div class="chat-avatar small">${(u.display_name || 'U')[0].toUpperCase()}</div>
      <div class="footer-info">
        <div class="footer-name">${escHtml(u.display_name || u.username)}</div>
        <div class="footer-status">${escHtml(u.status_text || 'Online')}</div>
      </div>
      <button class="icon-btn" id="logout-btn" title="Logout" aria-label="Logout">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M6.5 2.5H3a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h3.5"/><path d="M12.5 12.5L16 9l-3.5-3.5"/><path d="M16 9H6.5"/></svg>
      </button>
    </div>
  `;
  document.getElementById('logout-btn').onclick = () => {
    disconnect();
    clearAuth();
    location.reload();
  };
}

function setupSearch() {
  const searchInput = document.getElementById('chat-search');
  if (!searchInput) return;
  let timer;
  searchInput.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = searchInput.value.trim();
      if (q.length < 2) { closeSearch(); return; }
      try {
        state.searchResults = await api.search(q);
        showSearchResults();
      } catch { /* */ }
    }, 300);
  };
  searchInput.onfocus = () => {
    if (searchInput.value.trim().length >= 2) showSearchResults();
  };
}



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
    list.innerHTML = '<div class="empty-chat-list">No conversations yet.<br><span style="font-size:0.78rem;color:var(--text-tertiary)">Click + to start one</span></div>';
    return;
  }
  list.innerHTML = '';
  state.chats.forEach(c => {
    const grp = c.type === 'group';
    const other = c.participants?.find(p => p.id !== state.user?.id);
    const nm = grp ? (c.name || 'Group') : (other?.display_name || 'Unknown');
    const init = grp ? '👥' : ((other?.display_name || '?')[0].toUpperCase());
    const onl = !grp && other && state.onlineUsers[other.id]?.status === 'online';
    const lm = c.last_message;
    let prev = '';
    if (lm) {
      if (lm.file_type) prev = lm.file_type.startsWith('image/') ? '📷 Photo' : '📎 File';
      else if (lm.content) prev = lm.content.substring(0, 55);
      if (lm.sender_id === state.user?.id) prev = 'You: ' + prev;
    }
    const div = mk('div', { class: 'chat-item' + (state.currentChat?.id === c.id ? ' active' : ''), 'data-id': c.id });
    div.innerHTML = `
      <div class="chat-avatar ${grp ? 'group' : ''}">
        <span>${init}</span>
        ${onl ? '<div class="online-dot"></div>' : ''}
      </div>
      <div class="chat-info">
        <div class="chat-name">${escHtml(nm)}</div>
        <div class="chat-preview">${escHtml(prev)}</div>
      </div>
      <div class="chat-meta">
        <div class="chat-time">${lm ? formatTime(lm.created_at) : ''}</div>
        <div class="unread-badge ${c.unread > 0 ? 'show' : ''}">${c.unread > 99 ? '99+' : c.unread}</div>
      </div>
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

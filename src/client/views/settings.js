/* ── Settings, New Chat, Chat Menu ── */
import { state } from '../js/state.js';
import { api } from '../js/api.js';
import { send } from '../js/ws.js';
import { escHtml } from '../js/dom.js';
import { showModal, closeMenu } from '../utils/modals.js';
import { toast } from '../utils/toast.js';

// Set by main.js
export let loadChatsFn = null;
export let openChatFn = null;
export let renderFooterFn = null;
export let renderChatListFn = null;
export function setLoadChatsFn(fn) { loadChatsFn = fn; }
export function setOpenChatFn(fn) { openChatFn = fn; }
export function setRenderFooterFn(fn) { renderFooterFn = fn; }
export function setRenderChatListFn(fn) { renderChatListFn = fn; }

/* ── New Chat ── */
export async function showNewChat() {
  let users;
  try { users = await api.getUsers(); } catch { return; }
  if (state.currentChat) {
    send({ type: 'leave_chat', chat_id: state.currentChat.id });
    state.currentChat = null; state.messages = [];
  }
  document.getElementById('chat-view').style.display = 'none';
  document.getElementById('empty-state').style.display = 'flex';

  showModal('New Conversation', `
    <div class="form-group"><label>Search users</label><input type="text" id="user-search" class="form-input" placeholder="Type to filter…" autofocus></div>
    <div id="user-list" style="max-height:250px;overflow-y:auto;margin-bottom:0.75rem">${
      users.map(u => `<label class="user-select-item"><input type="checkbox" value="${u.id}"><span>${escHtml(u.display_name)} <span class="text2">@${escHtml(u.username)}</span></span></label>`).join('')
    }</div>
    <div class="form-group"><label>Group name (optional)</label><input type="text" id="group-name" class="form-input" placeholder="e.g. Dev Team"></div>
    <div class="modal-btns"><button class="btn-primary" id="start-chat-btn">Start Chat</button><button class="btn-cancel" onclick="window.closeModal()">Cancel</button></div>
  `);
  const us = document.getElementById('user-search');
  if (us) us.oninput = function () {
    const q = this.value.toLowerCase();
    document.querySelectorAll('.user-select-item').forEach(el => {
      el.style.display = el.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  };
  document.getElementById('start-chat-btn').onclick = async () => {
    const checked = [...document.querySelectorAll('#user-list input:checked')].map(c => c.value);
    const gn = document.getElementById('group-name')?.value.trim();
    if (!checked.length) { toast('Select at least one user', 'warning'); return; }
    try {
      const type = (gn || checked.length > 1) ? 'group' : 'private';
      const res = await api.createChat({ type, name: type === 'group' ? gn : undefined, user_ids: checked });
      window.closeModal();
      if (loadChatsFn) await loadChatsFn();
      if (openChatFn) openChatFn(res.id);
    } catch (e) { toast(e.message, 'error'); }
  };
}

/* ── Settings ── */
export function showSettings() {
  closeSearch?.();
  if (state.currentChat) {
    send({ type: 'leave_chat', chat_id: state.currentChat.id });
    state.currentChat = null; state.messages = [];
  }
  document.getElementById('chat-view').style.display = 'none';
  document.getElementById('empty-state').style.display = 'flex';
  document.getElementById('sidebar')?.classList.remove('hidden');

  const u = state.user;
  showModal('Settings', `
    <div class="form-group"><label>Display Name</label><input type="text" id="set-name" class="form-input" value="${escHtml(u.display_name || '')}" maxlength="50"></div>
    <div class="form-group"><label>Bio</label><input type="text" id="set-bio" class="form-input" value="${escHtml(u.bio || '')}" placeholder="Tell about yourself" maxlength="300"></div>
    <div class="form-group"><label>Status</label><input type="text" id="set-status" class="form-input" value="${escHtml(u.status_text || '')}" placeholder="What's on your mind?" maxlength="100"></div>
    <div class="form-group"><label>Theme</label><div class="theme-grid">
      <button class="theme-opt ${(u.theme || 'dark') === 'dark' ? 'active' : ''}" data-theme="dark">🌙 Dark</button>
      <button class="theme-opt ${u.theme === 'light' ? 'active' : ''}" data-theme="light">☀️ Light</button>
    </div></div>
    <div class="form-group"><label>Layout</label><div class="theme-grid">
      <button class="theme-opt ${(u.lang || 'ltr') === 'ltr' ? 'active' : ''}" data-lang="ltr">📖 LTR</button>
      <button class="theme-opt ${u.lang === 'rtl' ? 'active' : ''}" data-lang="rtl">📖 RTL</button>
    </div></div>
    <div class="form-group"><label>Notifications</label><button class="btn-primary" id="notif-btn" style="padding:0.55rem 1rem;border-radius:10px;font-size:0.85rem;font-weight:600;width:100%">${Notification.permission === 'granted' ? '✅ Notifications On' : '🔔 Enable Notifications'}</button></div>
    <div class="modal-btns"><button class="btn-primary" id="save-settings">Save</button><button class="btn-cancel" onclick="window.closeModal()">Cancel</button></div>
  `);

  document.querySelectorAll('.theme-opt[data-theme]').forEach(b => {
    b.onclick = function () {
      document.querySelectorAll('.theme-opt[data-theme]').forEach(x => x.classList.remove('active'));
      this.classList.add('active');
    };
  });
  document.querySelectorAll('.theme-opt[data-lang]').forEach(b => {
    b.onclick = function () {
      document.querySelectorAll('.theme-opt[data-lang]').forEach(x => x.classList.remove('active'));
      this.classList.add('active');
    };
  });
  document.getElementById('notif-btn').onclick = () => {
    if ('Notification' in window) Notification.requestPermission();
  };
  document.getElementById('save-settings').onclick = async () => {
    const dn = document.getElementById('set-name')?.value.trim();
    const bio = document.getElementById('set-bio')?.value.trim();
    const st = document.getElementById('set-status')?.value.trim();
    const theme = document.querySelector('.theme-opt[data-theme].active')?.dataset.theme || 'dark';
    const lang = document.querySelector('.theme-opt[data-lang].active')?.dataset.lang || 'ltr';
    try {
      await api.updateProfile({ display_name: dn, bio, status_text: st, theme, lang });
      Object.assign(state.user, { display_name: dn, bio, status_text: st, theme, lang });
      send({ type: 'update_status', status: 'online', status_text: st });
      document.documentElement.classList.toggle('light-theme', theme === 'light');
      document.documentElement.dir = lang;
      if (loadChatsFn) loadChatsFn();
      if (renderFooterFn) renderFooterFn();
      window.closeModal();
      toast('Settings saved', 'success');
    } catch (e) { toast(e.message, 'error'); }
  };
}

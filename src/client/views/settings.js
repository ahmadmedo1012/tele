/* ── Settings, New Chat ── */
import { state } from '../js/state.js';
import { api } from '../js/api.js';
import { send } from '../js/ws.js';
import { escHtml } from '../js/dom.js';
import { showModal, closeMenu } from '../utils/modals.js';
import { toast } from '../utils/toast.js';

export let loadChatsFn = null;
export let openChatFn = null;
export function setLoadChatsFn(fn) { loadChatsFn = fn; }
export function setOpenChatFn(fn) { openChatFn = fn; }

/* ── New Chat ── */
export async function showNewChat() {
  let users;
  try { users = await api.getUsers(); } catch { return; }
  
  // Close current chat
  if (state.currentChat) {
    send({ type: 'leave_chat', chat_id: state.currentChat.id });
    state.currentChat = null; state.messages = [];
  }
  document.getElementById('chat-view').style.display = 'none';
  document.getElementById('welcome-screen').style.display = 'flex';

  showModal('New Chat', `
    <div class="form-group">
      <input type="text" id="user-search" class="form-input" placeholder="Search users…" autofocus>
    </div>
    <div id="user-list" style="max-height:260px;overflow-y:auto;margin-bottom:0.75rem">
      ${users.map(u => `
        <label class="user-check-item" data-uid="${u.id}">
          <div class="user-avatar-sm">${(u.display_name || '?')[0].toUpperCase()}</div>
          <div class="user-info-sm">
            <div class="user-name-sm">${escHtml(u.display_name)}</div>
            <div class="user-uname-sm">@${escHtml(u.username)}</div>
          </div>
          <input type="checkbox" value="${u.id}">
        </label>
      `).join('')}
    </div>
    <div class="form-group" id="group-name-group" style="display:none">
      <input type="text" id="group-name" class="form-input" placeholder="Group name (optional)">
    </div>
    <div class="modal-btns">
      <button class="btn-primary" id="start-chat-btn" disabled>Start Chat</button>
      <button class="btn-cancel" onclick="window.closeModal()">Cancel</button>
    </div>
  `);

  const us = document.getElementById('user-search');
  const ul = document.getElementById('user-list');
  const gn = document.getElementById('group-name-group');
  
  if (us) us.oninput = function() {
    const q = this.value.toLowerCase();
    let checked = 0;
    ul.querySelectorAll('.user-check-item').forEach(el => {
      const match = el.textContent.toLowerCase().includes(q);
      el.style.display = match ? '' : 'none';
    });
    updateStartBtn();
  };

  ul?.addEventListener('change', updateStartBtn);

  function updateStartBtn() {
    const checked = ul?.querySelectorAll('input:checked').length || 0;
    const btn = document.getElementById('start-chat-btn');
    if (btn) {
      btn.disabled = checked === 0;
      btn.textContent = checked === 0 ? 'Select someone' : checked === 1 ? 'Start Chat' : `Start Group (${checked})`;
    }
    if (gn) gn.style.display = checked > 1 ? 'block' : 'none';
  }

  document.getElementById('start-chat-btn').onclick = async () => {
    const checked = [...ul.querySelectorAll('input:checked')].map(c => c.value);
    if (!checked.length) return;
    const name = document.getElementById('group-name')?.value.trim();
    try {
      const type = (name || checked.length > 1) ? 'group' : 'private';
      const res = await api.createChat({ type, name: type === 'group' ? name : undefined, user_ids: checked });
      window.closeModal();
      if (loadChatsFn) await loadChatsFn();
      if (openChatFn) openChatFn(res.id);
      toast('Chat created!', 'success');
    } catch (e) { toast(e.message, 'error'); }
  };
}

/* ── Settings ── */
export function showSettings() {
  // Close search
  const sr = document.getElementById('search-results');
  if (sr) sr.classList.remove('show');

  if (state.currentChat) {
    send({ type: 'leave_chat', chat_id: state.currentChat.id });
    state.currentChat = null; state.messages = [];
  }
  document.getElementById('chat-view').style.display = 'none';
  document.getElementById('welcome-screen').style.display = 'flex';
  document.getElementById('sidebar')?.classList.remove('hidden');

  const u = state.user;
  const initial = (u.display_name || 'U')[0].toUpperCase();
  showModal('Settings', `
    <div style="text-align:center;margin-bottom:1.25rem">
      <div class="settings-avatar">${escHtml(initial)}</div>
    </div>
    <div class="form-group"><label>Display Name</label><input type="text" id="set-name" class="form-input" value="${escHtml(u.display_name || '')}" maxlength="50"></div>
    <div class="form-group"><label>Bio</label><input type="text" id="set-bio" class="form-input" value="${escHtml(u.bio || '')}" placeholder="Tell about yourself" maxlength="300"></div>
    <div class="form-group"><label>Phone</label><input type="tel" id="set-phone" class="form-input" value="${escHtml(u.phone || '')}" placeholder="رقم الهاتف" maxlength="20"></div>
    <div class="form-group"><label>Status</label><input type="text" id="set-status" class="form-input" value="${escHtml(u.status_text || '')}" placeholder="What's on your mind?" maxlength="100"></div>
    <div class="form-group"><label>Theme</label><div class="theme-grid">
      <button class="theme-opt ${(u.theme||'dark')==='dark'?'active':''}" data-theme="dark">🌙 Dark</button>
      <button class="theme-opt ${u.theme==='light'?'active':''}" data-theme="light">☀️ Light</button>
    </div></div>
    <div class="form-group"><label>Layout</label><div class="theme-grid">
      <button class="theme-opt ${(u.lang||'ltr')==='ltr'?'active':''}" data-lang="ltr">📖 LTR</button>
      <button class="theme-opt ${u.lang==='rtl'?'active':''}" data-lang="rtl">📖 RTL</button>
    </div></div>
    <div class="modal-btns" style="margin-top:1.25rem">
      <button class="btn-primary" id="save-settings">Save & Close</button>
      <button class="btn-cancel" onclick="window.closeModal()">Cancel</button>
    </div>
  `);

  document.querySelectorAll('.theme-opt[data-theme]').forEach(b => b.onclick = function() {
    document.querySelectorAll('.theme-opt[data-theme]').forEach(x => x.classList.remove('active'));
    this.classList.add('active');
  });
  document.querySelectorAll('.theme-opt[data-lang]').forEach(b => b.onclick = function() {
    document.querySelectorAll('.theme-opt[data-lang]').forEach(x => x.classList.remove('active'));
    this.classList.add('active');
  });

  document.getElementById('save-settings').onclick = async () => {
    const dn = document.getElementById('set-name')?.value.trim();
    const bio = document.getElementById('set-bio')?.value.trim();
    const ph = document.getElementById('set-phone')?.value.trim();
    const st = document.getElementById('set-status')?.value.trim();
    const theme = document.querySelector('.theme-opt[data-theme].active')?.dataset.theme || 'dark';
    const lang = document.querySelector('.theme-opt[data-lang].active')?.dataset.lang || 'ltr';
    try {
      await api.updateProfile({ display_name: dn, bio, phone: ph, status_text: st, theme, lang });
      Object.assign(state.user, { display_name: dn, bio, phone: ph, status_text: st, theme, lang });
      send({ type: 'update_status', status: 'online', status_text: st || '' });
      document.documentElement.classList.toggle('dark-theme', theme === 'dark');
      document.documentElement.classList.toggle('light-theme', theme !== 'dark');
      document.documentElement.dir = lang;
      if (loadChatsFn) loadChatsFn();
      window.closeModal();
      toast('Settings saved!', 'success');
    } catch (e) { toast(e.message, 'error'); }
  };
}

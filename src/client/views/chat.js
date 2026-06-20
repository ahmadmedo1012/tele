/* ── Chat view: messages, input, reactions, editing ── */
import { state } from '../js/state.js';
import { api } from '../js/api.js';
import { send } from '../js/ws.js';
import { mk, escHtml, show, hide, qs, linkify, formatTime } from '../js/dom.js';
import { showModal, showMenu, closeMenu } from '../utils/modals.js';
import { toast } from '../utils/toast.js';
import { updateTitleBadge } from '../utils/notifications.js';

// Set by main.js — avoids circular import with sidebar
export let loadChatsFn = null;
export let renderChatListFn = null;
export function setLoadChatsFn(fn) { loadChatsFn = fn; }
export function setRenderChatListFn(fn) { renderChatListFn = fn; }

/* ── Render main area ── */
export function renderMain() {
  const m = document.getElementById('main');
  if (!m) return;
  m.innerHTML = `
    <div class="empty-state" id="empty-state">
      <div class="empty-icon">💬</div>
      <h3>Welcome to Tele</h3>
      <p>Select a conversation or start a new one</p>
    </div>
    <div class="chat-view" id="chat-view">
      <div class="chat-header" id="chat-header"></div>
      <div class="reply-preview" id="reply-preview">
        <div class="reply-content">
          <span class="reply-label">Replying</span>
          <span id="reply-text"></span>
        </div>
        <button id="cancel-reply" aria-label="Cancel reply">✕</button>
      </div>
      <div class="messages-area" id="messages-area">
        <div class="loading-msg" id="loading-msg" style="display:none">Loading messages…</div>
      </div>
      <div class="typing-indicator" id="typing-indicator">
        <span id="typing-text"></span>
        <span class="typing-dots"><span></span><span></span><span></span></span>
      </div>
      <div class="input-area" id="input-area">
        <button class="attach-btn" id="attach-btn" title="Attach file" aria-label="Attach file">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M10 3v10.5a3 3 0 0 0 6 0V6"/><path d="M4 8v5.5a3.5 3.5 0 0 0 7 0V5"/></svg>
        </button>
        <button class="attach-btn" id="voice-btn" title="Voice message" aria-label="Voice message">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M10 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3z"/><path d="M5 10v1a5 5 0 0 0 10 0v-1"/><path d="M10 17v2"/></svg>
        </button>
        <input type="file" id="file-input" style="display:none" accept="image/*,.pdf,.zip,.mp3,.ogg,.mp4,.txt">
        <textarea id="msg-input" rows="1" placeholder="Type a message…" autocomplete="off"></textarea>
        <button class="send-btn" id="send-btn" aria-label="Send message">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9l12-6-4 12-3-5-5-1z"/></svg>
        </button>
      </div>
      <div class="upload-preview" id="upload-preview"></div>
    </div>
  `;
  document.getElementById('chat-view').style.display = 'none';
  setupChatInput();
  setupVoiceRecording();
  document.getElementById('cancel-reply').onclick = cancelReply;
}

/* ── Voice recording ── */
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

function setupVoiceRecording() {
  const vb = document.getElementById('voice-btn');
  if (!vb) return;
  vb.onclick = async () => {
    if (isRecording) return stopRecording();
    startRecording();
  };
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia) {
    toast('Voice recording not supported in this browser', 'warning');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
    audioChunks = [];
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.onstop = () => sendVoiceRecording();
    mediaRecorder.start();
    isRecording = true;
    const vb = document.getElementById('voice-btn');
    if (vb) {
      vb.style.color = 'var(--accent-red)';
      vb.style.background = 'rgba(252,129,129,0.15)';
    }
    toast('Recording… tap to stop', 'info', 2000);
  } catch {
    toast('Microphone access denied', 'error');
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(t => t.stop());
    isRecording = false;
    const vb = document.getElementById('voice-btn');
    if (vb) { vb.style.color = ''; vb.style.background = ''; }
  }
}

async function sendVoiceRecording() {
  const cid = state.currentChat?.id;
  if (!cid || !audioChunks.length) return;
  const blob = new Blob(audioChunks, { type: 'audio/webm' });
  if (blob.size < 100) return;
  const fd = new FormData();
  fd.append('file', blob, `voice-${Date.now()}.webm`);
  fd.append('content', '🎤 Voice message');
  if (state.replyTo) fd.append('reply_to', state.replyTo);
  try {
    const msg = await api.sendMessage(cid, fd);
    addMessageToView(msg);
    if (loadChatsFn) loadChatsFn(true);
  } catch (e) {
    toast('Voice message failed: ' + e.message, 'error');
  }
}

/* ── Chat input ── */
function setupChatInput() {
  const ta = document.getElementById('msg-input');
  const sendBtn = document.getElementById('send-btn');
  const attachBtn = document.getElementById('attach-btn');
  const fileInput = document.getElementById('file-input');
  let typingTimer;

  if (ta) {
    ta.oninput = () => {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
      if (state.currentChat) {
        send({ type: 'typing', chat_id: state.currentChat.id });
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => send({ type: 'stop_typing', chat_id: state.currentChat.id }), 2000);
      }
    };
    ta.onkeydown = e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    };
  }
  if (sendBtn) sendBtn.onclick = sendMessage;
  if (attachBtn) attachBtn.onclick = () => fileInput?.click();
  if (fileInput) fileInput.onchange = () => {
    const f = fileInput.files[0];
    if (!f) return;
    if (f.size > 50 * 1024 * 1024) { toast('File too large (max 50MB)', 'error'); fileInput.value = ''; return; }
    showUploadPreview(f);
  };
}

function showUploadPreview(file) {
  const pv = document.getElementById('upload-preview');
  if (!pv) return;
  if (file.type.startsWith('image/')) {
    const r = new FileReader();
    r.onload = e => {
      pv.innerHTML = `<div class="upload-preview-inner"><img src="${e.target.result}"><button id="cancel-upload" aria-label="Cancel upload">✕</button></div>`;
      pv.style.display = 'block';
      document.getElementById('cancel-upload').onclick = () => {
        document.getElementById('file-input').value = '';
        pv.style.display = 'none';
        pv.innerHTML = '';
      };
    };
    r.readAsDataURL(file);
  } else {
    pv.innerHTML = `<div class="upload-preview-inner"><span>📎 ${escHtml(file.name)} (${(file.size/1024).toFixed(0)} KB)</span><button id="cancel-upload" aria-label="Cancel upload">✕</button></div>`;
    pv.style.display = 'block';
    document.getElementById('cancel-upload').onclick = () => {
      document.getElementById('file-input').value = '';
      pv.style.display = 'none';
      pv.innerHTML = '';
    };
  }
}

export async function sendMessage() {
  const ta = document.getElementById('msg-input');
  const fi = document.getElementById('file-input');
  const cid = state.currentChat?.id;
  if (!cid) return;
  const file = fi?.files[0];
  const content = ta?.value.trim();
  if (!content && !file) return;

  // If editing, send edit instead
  if (state.editingMessage) return sendEdit(state.editingMessage, content);

  if (file) {
    const fd = new FormData();
    if (content) fd.append('content', content);
    fd.append('file', file);
    if (state.replyTo) fd.append('reply_to', state.replyTo);
    try {
      const msg = await api.sendMessage(cid, fd);
      addMessageToView(msg);
      if (loadChatsFn) loadChatsFn(true);
      fi.value = '';
      const pv = document.getElementById('upload-preview');
      if (pv) { pv.style.display = 'none'; pv.innerHTML = ''; }
    } catch (e) { toast('Send failed: ' + e.message, 'error'); }
  } else {
    send({ type: 'message', chat_id: cid, content, reply_to: state.replyTo || undefined });
  }
  if (ta) { ta.value = ''; ta.style.height = 'auto'; }
  cancelReply();
}

/* ── Message editing ── */
export function startEditing(msg) {
  state.editingMessage = msg.id;
  const ta = document.getElementById('msg-input');
  const rp = document.getElementById('reply-preview');
  if (ta) {
    ta.value = msg.content || '';
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }
  if (rp) {
    rp.style.display = 'flex';
    rp.querySelector('.reply-content').innerHTML =
      `<span class="reply-label" style="color:var(--accent-teal)">Editing</span><span id="reply-text">${escHtml((msg.content || '').substring(0, 80))}</span>`;
  }
  const sendBtn = document.getElementById('send-btn');
  if (sendBtn) sendBtn.style.background = 'linear-gradient(135deg, var(--accent-teal), var(--primary))';
}

export function cancelEditing() {
  state.editingMessage = null;
  const ta = document.getElementById('msg-input');
  if (ta) { ta.value = ''; ta.style.height = 'auto'; }
  cancelReply();
  const sendBtn = document.getElementById('send-btn');
  if (sendBtn) sendBtn.style.background = '';
}

export async function sendEdit(msgId, content) {
  if (!content) { cancelEditing(); return; }
  try {
    const msg = await api.editMessage(msgId, { content });
    const el = document.querySelector(`.message[data-id="${msgId}"]`);
    if (el) {
      const contentEl = el.querySelector('.msg-content');
      if (contentEl) {
        contentEl.innerHTML = linkify(escHtml(content));
        const timeEl = el.querySelector('.time');
        if (timeEl && !timeEl.querySelector('.edited')) {
          const edited = document.createElement('span');
          edited.className = 'edited';
          edited.textContent = ' · edited';
          edited.style.cssText = 'font-size:0.62rem;opacity:0.6';
          timeEl.prepend(edited);
        }
      }
    }
    cancelEditing();
  } catch (e) { toast('Edit failed: ' + e.message, 'error'); cancelEditing(); }
}

/* ── Reply ── */
export function replyToMessage(id, name, content) {
  cancelEditing();
  state.replyTo = id;
  const rp = document.getElementById('reply-preview');
  const rpContent = rp?.querySelector('.reply-content');
  if (rpContent) {
    rpContent.innerHTML =
      `<span class="reply-label">Replying to ${escHtml(name)}</span><span id="reply-text">${escHtml((content || '').substring(0, 80) || '📎 File')}</span>`;
    rp.style.display = 'flex';
  }
  const inp = document.getElementById('msg-input');
  if (inp) inp.focus();
}

export function cancelReply() {
  state.replyTo = null;
  state.editingMessage = null;
  const rp = document.getElementById('reply-preview');
  if (rp) rp.style.display = 'none';
  const sendBtn = document.getElementById('send-btn');
  if (sendBtn) sendBtn.style.background = '';
}

/* ── Open a chat ── */
export async function openChat(cid) {
  const chat = state.chats.find(c => c.id === cid);
  if (!chat) return;
  if (state.currentChat && state.currentChat.id !== cid) {
    send({ type: 'leave_chat', chat_id: state.currentChat.id });
  }
  state.currentChat = chat;
  state.messages = [];
  state.hasMore = true;
  state.loadingMore = false;
  cancelReply();
  send({ type: 'join_chat', chat_id: cid });

  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('chat-view').style.display = 'flex';
  renderChatHeader();
  loadMessages();

  if (window.innerWidth <= 768) {
    document.getElementById('sidebar')?.classList.add('hidden');
    document.getElementById('main')?.classList.remove('hidden');
  }

  try {
    const updated = await api.getChats();
    state.currentChat = updated.find(c => c.id === cid) || chat;
  } catch { /* */ }
  if (renderChatListFn) renderChatListFn();
}

function renderChatHeader() {
  const h = document.getElementById('chat-header');
  if (!h || !state.currentChat) return;
  const chat = state.currentChat;
  const grp = chat.type === 'group';
  const other = chat.participants?.find(p => p.id !== state.user?.id);
  const nm = grp ? (chat.name || 'Group') : (other?.display_name || 'Unknown');
  const init = grp ? '👥' : ((other?.display_name || '?')[0].toUpperCase());
  const onl = !grp && other && state.onlineUsers[other.id]?.status === 'online';

  h.innerHTML = `
    <button class="back-btn" id="back-btn" aria-label="Back">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 4l-6 6 6 6"/></svg>
    </button>
    <div class="chat-avatar ${grp ? 'group' : ''}" style="width:40px;height:40px;font-size:0.9rem">
      <span>${init}</span>
      ${onl ? '<div class="online-dot"></div>' : ''}
    </div>
    <div class="chat-title">
      <h3>${escHtml(nm)}</h3>
      <span id="chat-status">${grp ? (chat.participants?.length || 0) + ' members' : (onl ? 'Online' : 'Offline')}</span>
    </div>
    <button class="icon-btn" id="chat-menu-btn" title="More" aria-label="More">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><circle cx="10" cy="4" r="1.5"/><circle cx="10" cy="10" r="1.5"/><circle cx="10" cy="16" r="1.5"/></svg>
    </button>
  `;
  document.getElementById('back-btn').onclick = () => {
    if (window.innerWidth <= 768) {
      document.getElementById('sidebar')?.classList.remove('hidden');
    }
  };
  document.getElementById('chat-menu-btn').onclick = showChatMenu;
}

/* ── Messages ── */
function renderMessages() {
  const area = document.getElementById('messages-area');
  if (!area) return;
  hide(document.getElementById('loading-msg'));
  area.innerHTML = '';
  if (!state.messages.length) {
    area.innerHTML = '<div class="empty-msg-area">No messages yet. Say hello! 👋</div>';
    return;
  }
  state.messages.forEach(m => appendMessage(m));
  area.scrollTop = area.scrollHeight;
  area.onscroll = () => {
    if (area.scrollTop < 100 && state.hasMore && !state.loadingMore) loadOlder();
  };
}

async function loadOlder() {
  if (!state.messages.length || state.loadingMore || !state.hasMore) return;
  state.loadingMore = true;
  const area = document.getElementById('messages-area');
  const sh = area.scrollHeight;
  try {
    const older = await api.getMessages(state.currentChat.id, state.messages[0].created_at);
    if (!older.length) { state.hasMore = false; return; }
    const existing = new Set(state.messages.map(m => m.id));
    const fresh = older.filter(m => !existing.has(m.id));
    if (!fresh.length) { state.hasMore = false; return; }
    state.messages = [...fresh, ...state.messages];
    area.innerHTML = '';
    state.messages.forEach(m => appendMessage(m));
    area.scrollTop = area.scrollHeight - sh;
  } catch { /* */ }
  state.loadingMore = false;
}

async function loadMessages() {
  if (!state.currentChat) return;
  try {
    const msgs = await api.getMessages(state.currentChat.id);
    state.messages = msgs || [];
    state.hasMore = msgs && msgs.length >= 50;
  } catch { state.messages = []; }
  renderMessages();
}

function appendMessage(m) {
  const area = document.getElementById('messages-area');
  if (!area) return;
  if (area.querySelector(`.message[data-id="${m.id}"]`)) return;
  const own = m.sender_id === state.user?.id;
  const div = mk('div', { class: `message ${own ? 'own' : 'other'}`, 'data-id': m.id });
  let extra = '';
  if (m.reply_to) extra += '<div class="reply-indicator">↪ Replying to message</div>';
  if (m.file_path) {
    if (m.file_type?.startsWith('image/')) {
      extra += `<div class="file-attach"><img src="${m.file_path}" loading="lazy" onclick="window.open(this.src)" style="max-width:240px;border-radius:8px;cursor:pointer"></div>`;
    } else if (m.file_type?.startsWith('audio/')) {
      extra += `<div class="file-attach voice-msg"><audio src="${m.file_path}" controls style="height:40px;max-width:220px"></audio></div>`;
    } else {
      extra += `<div class="file-attach">📎 <a href="${m.file_path}" target="_blank" rel="noopener">${escHtml(m.file_name || 'Download')}</a> ${m.file_size ? '(' + (m.file_size/1024).toFixed(0) + ' KB)' : ''}</div>`;
    }
  }
  const reacts = m.reactions || [];
  let reactHtml = '';
  if (reacts.length) {
    const g = {};
    reacts.forEach(r => { g[r.emoji] = (g[r.emoji] || 0) + 1; });
    reactHtml = `<div class="reactions">${Object.entries(g).map(([e, c]) => `<span class="reaction" data-emoji="${e}">${e}${c > 1 ? c : ''}</span>`).join('')}</div>`;
  }
  const edited = m.edited_at ? '<span class="edited" style="font-size:0.62rem;opacity:0.6"> · edited</span>' : '';
  div.innerHTML = `
    ${!own ? `<div class="sender">${escHtml(m.sender_name || 'Unknown')}</div>` : ''}
    ${extra}
    <div class="msg-content">${linkify(escHtml(m.content || ''))}</div>
    ${reactHtml}
    <div class="time">${edited}${formatTime(m.created_at)}</div>
  `;
  div.onclick = e => {
    if (!e.target.closest('.reaction')) showMsgMenu(e, m);
  };
  div.ondblclick = () => toggleReaction(m.id, '👍');
  area.appendChild(div);
  if (area.scrollTop >= area.scrollHeight - area.clientHeight - 100) {
    area.scrollTop = area.scrollHeight;
  }
}

export function addMessageToView(msg) {
  const area = document.getElementById('messages-area');
  if (!area) return;
  if (state.messages.some(m => m.id === msg.id)) return;
  state.messages.push(msg);
  appendMessage(msg);
  area.scrollTop = area.scrollHeight;
}

export function updateMessageInView(msg) {
  // Update existing message (for edits)
  const el = document.querySelector(`.message[data-id="${msg.id}"]`);
  if (el) {
    const contentEl = el.querySelector('.msg-content');
    if (contentEl) contentEl.innerHTML = linkify(escHtml(msg.content || ''));
    const timeEl = el.querySelector('.time');
    if (timeEl && !timeEl.querySelector('.edited')) {
      const edited = document.createElement('span');
      edited.className = 'edited';
      edited.textContent = ' · edited';
      edited.style.cssText = 'font-size:0.62rem;opacity:0.6';
      timeEl.prepend(edited);
    }
  }
  const m = state.messages?.find(x => x.id === msg.id);
  if (m) { m.content = msg.content; m.edited_at = msg.edited_at; }
}

/* ── Typing ── */
export function showTyping(uid) {
  const el = document.getElementById('typing-indicator');
  const txt = document.getElementById('typing-text');
  if (!el || !txt || !state.currentChat) return;
  const other = state.currentChat.participants?.find(p => p.id !== state.user?.id);
  if (other && other.id === uid) {
    txt.textContent = `${other.display_name} is typing`;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), 3000);
  }
}

export function hideTyping(uid) {
  const el = document.getElementById('typing-indicator');
  if (!el) return;
  clearTimeout(el._timer);
  el.classList.remove('show');
}

/* ── Reactions ── */
export function updateMessageReactions(mid, reactions) {
  const msg = state.messages?.find(m => m.id === mid);
  if (msg) msg.reactions = reactions;
  const el = document.querySelector(`.message[data-id="${mid}"]`);
  if (!el) return;
  let re = el.querySelector('.reactions');
  if (re) re.remove();
  if (reactions.length) {
    const g = {};
    reactions.forEach(r => { g[r.emoji] = (g[r.emoji] || 0) + 1; });
    const d = mk('div', { class: 'reactions' });
    d.innerHTML = Object.entries(g).map(([e, c]) => `<span class="reaction">${e}${c > 1 ? c : ''}</span>`).join('');
    el.appendChild(d);
  }
}

export async function toggleReaction(mid, emoji) {
  try {
    const res = await api.react(mid, emoji);
    updateMessageReactions(mid, res.reactions);
  } catch { /* */ }
}



/* ── Message menu ── */
function showMsgMenu(e, msg) {
  e.stopPropagation();
  const own = msg.sender_id === state.user?.id;
  const items = [
    { label: '💬 Reply', action: () => replyToMessage(msg.id, msg.sender_name, msg.content) },
    { label: '😊 React', action: () => showReactBar(msg) },
  ];
  if (own) {
    items.push({ label: '✏️ Edit', action: () => startEditing(msg) });
    items.push({ label: '🗑️ Delete', action: () => deleteMsg(msg.id), danger: true });
  }
  showMenu(e.target, items);
}

function showReactBar(msg) {
  closeMenu();
  const bar = mk('div', {
    class: 'menu show',
    style: 'display:flex;gap:2px;padding:6px 8px;position:fixed;z-index:101',
  });
  const emojis = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '🎉'];
  emojis.forEach(emoji => {
    const btn = mk('button', {
      style: 'font-size:1.3rem;padding:2px 4px;border-radius:8px;transition:all 0.15s;cursor:pointer;background:none;border:none;line-height:1',
    });
    btn.textContent = emoji;
    btn.onmouseenter = () => { btn.style.background = 'var(--bg-hover)'; btn.style.transform = 'scale(1.25)'; };
    btn.onmouseleave = () => { btn.style.background = 'none'; btn.style.transform = 'scale(1)'; };
    btn.onclick = () => { toggleReaction(msg.id, emoji); closeMenu(); };
    bar.appendChild(btn);
  });
  document.body.appendChild(bar);
  // Position near the message element
  const msgEl = document.querySelector(`.message[data-id=\${msg.id}\]`);
  const msgRect = msgEl?.getBoundingClientRect() || { left: window.innerWidth/2 - 160, top: 100 };
  bar.style.top = Math.max(4, msgRect.top - 52) + 'px';
  bar.style.left = Math.max(4, Math.min(msgRect.left, window.innerWidth - 330)) + 'px';
}

export async function deleteMsg(id) {
  try {
    await api.deleteMessage(id);
    const el = document.querySelector(`.message[data-id="${id}"]`);
    if (el) {
      el.style.animation = 'msgOut 0.2s ease both';
      setTimeout(() => el.remove(), 200);
    }
  } catch (e) { toast('Delete failed', 'error'); }
}

/* ── Chat menu (archive, pin, clear) ── */
function showChatMenu(e) {
  e.stopPropagation();
  const chat = state.currentChat;
  if (!chat) return;
  showMenu(e.target, [
    { label: chat.is_archived ? '📂 Unarchive' : '📁 Archive',
      action: async () => { await api.updateChat(chat.id, { is_archived: chat.is_archived ? 0 : 1 }); if (loadChatsFn) loadChatsFn(); closeMenu(); } },
    { label: chat.is_pinned ? '📌 Unpin' : '📌 Pin',
      action: async () => { await api.updateChat(chat.id, { is_pinned: chat.is_pinned ? 0 : 1 }); if (loadChatsFn) loadChatsFn(); closeMenu(); } },
    { label: '👥 Add Members', action: addMembers, show: chat.type === 'group' },
    { label: '🗑️ Clear History',
      action: async () => {
        if (confirm('Clear history for everyone?')) {
          await api.clearChat(chat.id);
          state.messages = [];
          document.getElementById('messages-area').innerHTML = '';
          toast('History cleared', 'info');
        }
        closeMenu();
      } },
    { label: '🔍 Search in Chat', action: () => document.getElementById('chat-search')?.focus() },
  ]);
}

async function addMembers() {
  let users;
  try { users = await api.getUsers(); } catch { return; }
  const ex = state.currentChat.participants?.map(p => p.id) || [];
  const av = users.filter(u => !ex.includes(u.id));
  if (!av.length) { toast('No more users to add', 'info'); return; }
  showModal('Add Members',
    `<div id="user-list" style="max-height:250px;overflow-y:auto;margin-bottom:1rem">${
      av.map(u => `<label class="user-select-item"><input type="checkbox" value="${u.id}"><span>${escHtml(u.display_name)} @${escHtml(u.username)}</span></label>`).join('')
    }</div><div class="modal-btns"><button class="btn-primary" id="add-members-btn">Add</button><button class="btn-cancel" onclick="window.closeModal()">Cancel</button></div>`);
  document.getElementById('add-members-btn').onclick = async () => {
    const checked = [...document.querySelectorAll('#user-list input:checked')].map(c => c.value);
    if (!checked.length) { window.closeModal(); return; }
    try {
      await api.addParticipants(state.currentChat.id, checked);
      window.closeModal();
      state.currentChat.participants = await api.getParticipants(state.currentChat.id);
    } catch (e) { toast(e.message, 'error'); }
  };
}

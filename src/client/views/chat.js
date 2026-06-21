/* ── Chat view: messages, input, reactions, editing ── */
import { state } from '../js/state.js';
import { api } from '../js/api.js';
import { send } from '../js/ws.js';
import { mk, escHtml, show, hide, qs, linkify, formatTime } from '../js/dom.js';
import { showModal, showMenu, closeMenu } from '../utils/modals.js';
import { toast } from '../utils/toast.js';

export let loadChatsFn = null;
export let renderChatListFn = null;
export function setLoadChatsFn(fn) { loadChatsFn = fn; }
export function setRenderChatListFn(fn) { renderChatListFn = fn; }

/* ── Render main area ── */
export function renderMain() {
  const m = document.getElementById('main');
  if (!m) return;
  m.innerHTML = `
    <div class="welcome-screen" id="welcome-screen">
      <div class="welcome-content">
        <div class="welcome-logo">
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
            <rect width="64" height="64" rx="20" fill="url(#logoGradient)" opacity="0.15"/>
            <rect x="8" y="8" width="48" height="48" rx="14" fill="url(#logoGradient)"/>
            <path d="M22 32l10 10 14-16" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <h1>Tele Messenger</h1>
        <p>Select a chat or start a new conversation</p>
      </div>
    </div>
    <div class="chat-view" id="chat-view">
      <div class="chat-header" id="chat-header"></div>
      <div class="reply-preview" id="reply-preview">
        <div class="reply-content">
          <span class="reply-label">Replying</span>
          <span id="reply-text"></span>
        </div>
        <button id="cancel-reply" aria-label="Cancel">✕</button>
      </div>
      <div class="messages-area" id="messages-area">
        <div class="loading-msgs" id="loading-msgs" style="display:none">
          <div class="loader-ring"><svg viewBox="0 0 50 50"><circle cx="25" cy="25" r="20" fill="none" stroke="url(#logoGradient)" stroke-width="3" stroke-linecap="round" stroke-dasharray="125" stroke-dashoffset="125"><animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="1s" repeatCount="indefinite"/></svg></div>
        </div>
      </div>
      <div class="typing-indicator" id="typing-indicator">
        <span id="typing-text"></span>
        <span class="typing-dots"><span></span><span></span><span></span></span>
      </div>
      <div class="input-area" id="input-area">
        <button class="input-action-btn" id="attach-btn" title="Attach file">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
        </button>
        <input type="file" id="file-input" style="display:none" accept="image/*,.pdf,.zip,.mp3,.ogg,.mp4,.txt">
        <div class="input-wrapper">
          <textarea id="msg-input" rows="1" placeholder="Type a message" autocomplete="off"></textarea>
        </div>
        <button class="input-action-btn voice-btn" id="voice-btn" title="Voice message">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
        </button>
        <button class="send-btn" id="send-btn" aria-label="Send">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
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
  if (!navigator.mediaDevices?.getUserMedia) { toast('Voice recording not supported', 'warning'); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
    audioChunks = [];
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.onstop = () => sendVoiceRecording();
    mediaRecorder.start();
    isRecording = true;
    const vb = document.getElementById('voice-btn');
    if (vb) vb.classList.add('recording');
    toast('Recording… tap again to stop', 'info', 2000);
  } catch { toast('Microphone access denied', 'error'); }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(t => t.stop());
    isRecording = false;
    document.getElementById('voice-btn')?.classList.remove('recording');
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
  } catch (e) { toast('Voice message failed', 'error'); }
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
    // Focus on new chat
    ta.addEventListener('focus', () => { 
      document.getElementById('input-area')?.classList.add('focused');
    });
    ta.addEventListener('blur', () => {
      document.getElementById('input-area')?.classList.remove('focused');
    });
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
      pv.innerHTML = `<div class="upload-preview-inner"><img src="${e.target.result}"><button id="cancel-upload">✕</button></div>`;
      pv.style.display = 'block';
      document.getElementById('cancel-upload').onclick = () => { document.getElementById('file-input').value = ''; pv.style.display = 'none'; pv.innerHTML = ''; };
    };
    r.readAsDataURL(file);
  } else {
    pv.innerHTML = `<div class="upload-preview-inner"><span class="file-icon">📎</span><span>${escHtml(file.name)} (${(file.size/1024).toFixed(0)} KB)</span><button id="cancel-upload">✕</button></div>`;
    pv.style.display = 'block';
    document.getElementById('cancel-upload').onclick = () => { document.getElementById('file-input').value = ''; pv.style.display = 'none'; pv.innerHTML = ''; };
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
    } catch (e) { toast('Send failed', 'error'); }
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
  }
  if (rp) {
    rp.style.display = 'flex';
    rp.querySelector('.reply-content').innerHTML = `<span class="reply-label" style="color:var(--accent-teal)">Editing</span><span id="reply-text">${escHtml((msg.content || '').substring(0, 80))}</span>`;
  }
}

export function cancelEditing() {
  state.editingMessage = null;
  const ta = document.getElementById('msg-input');
  if (ta) { ta.value = ''; ta.style.height = 'auto'; }
  cancelReply();
}

async function sendEdit(msgId, content) {
  if (!content) { cancelEditing(); return; }
  try {
    await api.editMessage(msgId, { content });
    const el = document.querySelector(`.message[data-id="${msgId}"]`);
    if (el) {
      el.querySelector('.msg-content').innerHTML = linkify(escHtml(content));
      const t = el.querySelector('.msg-time');
      if (t && !t.querySelector('.edited')) t.prepend(mk('span', { class: 'edited', text: 'edited · ' }));
    }
    cancelEditing();
  } catch (e) { toast('Edit failed', 'error'); cancelEditing(); }
}

/* ── Reply ── */
export function replyToMessage(id, name, content) {
  cancelEditing();
  state.replyTo = id;
  const rp = document.getElementById('reply-preview');
  const rc = rp?.querySelector('.reply-content');
  if (rc) {
    rc.innerHTML = `<span class="reply-label">Replying to ${escHtml(name)}</span><span id="reply-text">${escHtml((content || '').substring(0, 80) || '📎 File')}</span>`;
    rp.style.display = 'flex';
  }
  document.getElementById('msg-input')?.focus();
}

export function cancelReply() {
  state.replyTo = null;
  state.editingMessage = null;
  const rp = document.getElementById('reply-preview');
  if (rp) rp.style.display = 'none';
}

/* ── Open chat ── */
export async function openChat(cid) {
  const chat = state.chats.find(c => c.id === cid);
  if (!chat) { toast('Chat not found', 'error'); return; }
  if (state.currentChat) send({ type: 'leave_chat', chat_id: state.currentChat.id });
  state.currentChat = chat;
  state.messages = [];
  state.hasMore = true;
  state.loadingMore = false;
  cancelReply();
  send({ type: 'join_chat', chat_id: cid });

  hide(document.getElementById('welcome-screen'));
  const cv = document.getElementById('chat-view');
  if (cv) cv.style.display = 'flex';
  renderChatHeader();
  show(document.getElementById('loading-msgs'));
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
  const onl = !grp && other && state.onlineUsers[other.id]?.status === 'online';

  h.innerHTML = `
    <div class="header-left">
      <button class="back-btn" id="back-btn" aria-label="Back">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
      </button>
      <div class="header-avatar" id="header-avatar">${grp ? '👥' : ((other?.display_name || '?')[0].toUpperCase())}</div>
      <div class="header-info">
        <div class="header-name">${escHtml(nm)}</div>
        <div class="header-status" id="header-status">${grp ? (chat.participants?.length || 0) + ' members' : (onl ? 'online' : 'offline')}</div>
      </div>
    </div>
    <div class="header-actions">
      <button class="icon-btn" id="chat-menu-btn" title="More" style="width:36px;height:36px">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
      </button>
    </div>
  `;
  document.getElementById('back-btn').onclick = () => {
    if (window.innerWidth <= 768) document.getElementById('sidebar')?.classList.remove('hidden');
    hide(document.getElementById('welcome-screen'));
    document.getElementById('chat-view').style.display = 'none';
    state.currentChat = null;
  };
  document.getElementById('chat-menu-btn').onclick = showChatMenu;
}

/* ── Messages ── */
function renderMessages() {
  const area = document.getElementById('messages-area');
  if (!area) return;
  hide(document.getElementById('loading-msgs'));
  area.innerHTML = '';
  if (!state.messages.length) {
    area.innerHTML = '<div class="empty-msgs">No messages yet<br><span>Send a message to start chatting</span></div>';
    return;
  }
  let lastDate = '';
  state.messages.forEach(m => {
    const d = new Date(m.created_at + (m.created_at.endsWith('Z') ? '' : 'Z'));
    const dateStr = d.toLocaleDateString();
    if (dateStr !== lastDate) {
      lastDate = dateStr;
      const sep = mk('div', { class: 'date-separator' });
      const today = new Date();
      let label = dateStr;
      if (d.toDateString() === today.toDateString()) label = 'Today';
      else {
        const y = new Date(today); y.setDate(y.getDate() - 1);
        if (d.toDateString() === y.toDateString()) label = 'Yesterday';
      }
      sep.innerHTML = `<span>${label}</span>`;
      area.appendChild(sep);
    }
    appendMessage(m);
  });
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
  if (!area || area.querySelector(`.message[data-id="${m.id}"]`)) return;
  const own = m.sender_id === state.user?.id;
  const div = mk('div', { class: `message ${own ? 'own' : 'other'}`, 'data-id': m.id });
  let extra = '';
  if (m.reply_to) extra += '<div class="reply-indicator">↪</div>';
  if (m.file_path) {
    if (m.file_type?.startsWith('image/')) {
      extra += `<div class="file-attach"><img src="${m.file_path}" loading="lazy" onclick="window.open(this.src)"></div>`;
    } else if (m.file_type?.startsWith('audio/')) {
      extra += `<div class="file-attach voice-msg"><audio src="${m.file_path}" controls style="height:40px;width:200px"></audio></div>`;
    } else {
      extra += `<div class="file-attach">📎 <a href="${m.file_path}" target="_blank">${escHtml(m.file_name || 'File')}</a> ${m.file_size ? '(' + (m.file_size/1024).toFixed(0) + ' KB)' : ''}</div>`;
    }
  }
  const reacts = m.reactions || [];
  let reactHtml = '';
  if (reacts.length) {
    const g = {};
    reacts.forEach(r => { g[r.emoji] = (g[r.emoji] || 0) + 1; });
    reactHtml = `<div class="msg-reactions">${Object.entries(g).map(([e, c]) => `<span class="reaction">${e}${c > 1 ? c : ''}</span>`).join('')}</div>`;
  }
  div.innerHTML = `
    ${!own ? `<div class="msg-sender">${escHtml(m.sender_name || '')}</div>` : ''}
    ${extra}
    <div class="msg-content">${linkify(escHtml(m.content || ''))}</div>
    ${reactHtml}
    <div class="msg-time">${m.edited_at ? '<span class="edited">edited · </span>' : ''}${formatTime(m.created_at)}</div>
  `;
  div.onclick = e => { if (!e.target.closest('.reaction')) showMsgMenu(e, m); };
  div.ondblclick = () => toggleReaction(m.id, '👍');
  area.appendChild(div);
  const nearBottom = area.scrollTop >= area.scrollHeight - area.clientHeight - 150;
  if (nearBottom) area.scrollTop = area.scrollHeight;
}

export function addMessageToView(msg) {
  if (state.messages.some(m => m.id === msg.id)) return;
  state.messages.push(msg);
  const area = document.getElementById('messages-area');
  if (!area) return;
  // Re-render to handle date separators properly
  renderMessages();
}

export function updateMessageInView(msg) {
  const el = document.querySelector(`.message[data-id="${msg.id}"]`);
  if (el) {
    el.querySelector('.msg-content').innerHTML = linkify(escHtml(msg.content || ''));
    const t = el.querySelector('.msg-time');
    if (t && !t.querySelector('.edited')) t.prepend(mk('span', { class: 'edited', text: 'edited · ' }));
  }
  const m = state.messages?.find(x => x.id === msg.id);
  if (m) { m.content = msg.content; m.edited_at = msg.edited_at; }
}

/* ── Typing ── */
export function showTyping(uid) {
  const el = document.getElementById('typing-indicator');
  if (!el || !state.currentChat) return;
  const other = state.currentChat.participants?.find(p => p.id !== state.user?.id);
  if (other && other.id === uid) {
    document.getElementById('typing-text').textContent = `${other.display_name} is typing`;
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
  let re = el.querySelector('.msg-reactions');
  if (re) re.remove();
  if (reactions.length) {
    const g = {};
    reactions.forEach(r => { g[r.emoji] = (g[r.emoji] || 0) + 1; });
    const d = mk('div', { class: 'msg-reactions' });
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
  showMenu(e.target, [
    { label: '💬 Reply', action: () => replyToMessage(msg.id, msg.sender_name, msg.content) },
    { label: '😊 React', action: () => showReactBar(msg) },
    ...(own ? [
      { label: '✏️ Edit', action: () => startEditing(msg) },
      { label: '🗑️ Delete', action: () => deleteMsg(msg.id), danger: true }
    ] : [])
  ]);
}

function showReactBar(msg) {
  closeMenu();
  const bar = mk('div', { class: 'menu show', style: 'display:flex;gap:2px;padding:6px 8px;position:fixed;z-index:101' });
  ['👍','❤️','😂','😮','😢','🙏','🔥','🎉'].forEach(emoji => {
    const btn = mk('button', { style: 'font-size:1.3rem;padding:2px 4px;border-radius:8px;cursor:pointer;background:none;border:none;line-height:1;transition:all 0.15s' });
    btn.textContent = emoji;
    btn.onmouseenter = () => { btn.style.background = 'var(--bg-hover)'; btn.style.transform = 'scale(1.25)'; };
    btn.onmouseleave = () => { btn.style.background = 'none'; btn.style.transform = 'scale(1)'; };
    btn.onclick = () => { toggleReaction(msg.id, emoji); closeMenu(); };
    bar.appendChild(btn);
  });
  document.body.appendChild(bar);
  const el = document.querySelector(`.message[data-id="${msg.id}"]`);
  const r = el?.getBoundingClientRect() || { top: 100, left: 100 };
  bar.style.top = Math.max(4, r.top - 52) + 'px';
  bar.style.left = Math.max(4, Math.min(r.left, window.innerWidth - 330)) + 'px';
}

export async function deleteMsg(id) {
  try {
    await api.deleteMessage(id);
    const el = document.querySelector(`.message[data-id="${id}"]`);
    if (el) el.remove();
  } catch { toast('Delete failed', 'error'); }
}

/* ── Chat menu ── */
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
      action: async () => { await api.clearChat(chat.id); state.messages = []; document.getElementById('messages-area').innerHTML = ''; toast('History cleared', 'info'); closeMenu(); } },
  ]);
}

async function addMembers() {
  let users;
  try { users = await api.getUsers(); } catch { return; }
  const ex = state.currentChat.participants?.map(p => p.id) || [];
  const av = users.filter(u => !ex.includes(u.id));
  if (!av.length) { toast('No more users to add', 'info'); return; }
  showModal('Add Members',
    `<div style="max-height:250px;overflow-y:auto;margin-bottom:1rem">${
      av.map(u => `<label class="user-check-item"><input type="checkbox" value="${u.id}"><span>${escHtml(u.display_name)}</span></label>`).join('')
    }</div>
    <div class="modal-btns"><button class="btn-primary" id="add-members-btn">Add</button><button class="btn-cancel" onclick="window.closeModal()">Cancel</button></div>`);
  document.getElementById('add-members-btn').onclick = async () => {
    const checked = [...document.querySelectorAll('#user-list input:checked')].map(c => c.value);
    if (!checked.length) { window.closeModal(); return; }
    try {
      await api.addParticipants(state.currentChat.id, checked);
      window.closeModal();
      state.currentChat.participants = await api.getParticipants(state.currentChat.id);
      toast('Members added', 'success');
    } catch (e) { toast(e.message, 'error'); }
  };
}

export const state = {
  user: null,
  token: null,
  chats: [],
  currentChat: null,
  messages: [],
  users: [],
  onlineUsers: {},
  typingUsers: {},
  searchResults: null,
  replyTo: null,
  hasMoreMessages: true,
  loadingMessages: false,
};

export function saveAuth(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem('tele_token', token);
  localStorage.setItem('tele_user', JSON.stringify(user));
}

export function loadAuth() {
  const token = localStorage.getItem('tele_token');
  const user = localStorage.getItem('tele_user');
  if (token && user) {
    try {
      state.token = token;
      state.user = JSON.parse(user);
      return true;
    } catch {}
  }
  return false;
}

export function clearAuth() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('tele_token');
  localStorage.removeItem('tele_user');
}

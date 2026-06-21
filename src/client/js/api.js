const BASE = '/api';

export const api = {
  token: null,

  async req(method, path, body) {
    const opts = { method, headers: {} };
    if (this.token) opts.headers['Authorization'] = `Bearer ${this.token}`;
    if (body && !(body instanceof FormData)) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    } else if (body instanceof FormData) {
      opts.body = body;
    }
    const res = await fetch(BASE + path, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  },

  register: (u, p, dn, ph) => api.req('POST', '/register', { username: u, password: p, display_name: dn, phone: ph || '' }),
  login: (u, p) => api.req('POST', '/login', { username: u, password: p }),
  getUsers: () => api.req('GET', '/users'),
  getUser: (id) => api.req('GET', '/users/' + id),
  getProfile: () => api.req('GET', '/profile'),
  updateProfile: (data) => api.req('PUT', '/profile', data),
  getChats: (archived) => api.req('GET', '/chats' + (archived ? '?archived=1' : '')),
  createChat: (data) => api.req('POST', '/chats', data),
  updateChat: (id, data) => api.req('PUT', '/chats/' + id, data),
  getParticipants: (id) => api.req('GET', '/chats/' + id + '/participants'),
  addParticipants: (id, uids) => api.req('POST', '/chats/' + id + '/participants', { user_ids: uids }),
  removeParticipant: (cid, uid) => api.req('DELETE', `/chats/${cid}/participants/${uid}`),
  getMessages: (cid, before) => {
    let q = '/chats/' + cid + '/messages';
    if (before) q += '?before=' + encodeURIComponent(before);
    return api.req('GET', q);
  },
  sendMessage: (cid, data) => api.req('POST', '/chats/' + cid + '/messages', data),
  editMessage: (id, data) => api.req('PUT', '/messages/' + id, data),
  deleteMessage: (id) => api.req('DELETE', '/messages/' + id),
  react: (id, emoji) => api.req('POST', '/messages/' + id + '/react', { emoji }),
  clearChat: (cid) => api.req('POST', `/chats/${cid}/clear`),
  search: (q) => api.req('GET', '/search?q=' + encodeURIComponent(q)),
};

export function setToken(t) { api.token = t; }

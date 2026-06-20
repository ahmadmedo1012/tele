/* ── Auth screen (login/register) ── */
import { api, setToken } from '../js/api.js';
import { state, saveAuth } from '../js/state.js';
import { qs, qsa } from '../js/dom.js';

let initAppFn = null;
export function setInitAppFn(fn) { initAppFn = fn; }

export function showAuth() {
  const screen = document.getElementById('auth-screen');
  const app = document.getElementById('app-screen');
  if (screen) screen.style.display = 'flex';
  if (app) app.classList.remove('active');

  const box = document.getElementById('auth-box');
  if (!box) return;
  let tab = 'login';

  box.innerHTML = `
    <div class="auth-tabs">
      <button class="auth-tab active" data-tab="login">Sign In</button>
      <button class="auth-tab" data-tab="register">Create Account</button>
    </div>
    <div id="auth-error" class="auth-error"></div>
    <div id="auth-form"></div>
  `;

  qsa('.auth-tab', box).forEach(btn => {
    btn.onclick = () => {
      qsa('.auth-tab', box).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      tab = btn.dataset.tab;
      renderAuthForm(tab);
    };
  });
  renderAuthForm('login');
}

function renderAuthForm(tab) {
  const form = document.getElementById('auth-form');
  const error = document.getElementById('auth-error');
  if (!form) return;
  if (error) error.style.display = 'none';
  form.style.animation = 'none';
  void form.offsetHeight;

  if (tab === 'login') {
    form.innerHTML = `
      <div class="form-group">
        <label>Username</label>
        <input type="text" id="login-user" class="form-input" autocomplete="username" placeholder="Enter your username" autofocus>
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" id="login-pass" class="form-input" autocomplete="current-password" placeholder="Enter password">
      </div>
      <button class="auth-btn" id="login-btn">Sign In</button>
    `;
    const inp = document.getElementById('login-user');
    if (inp) setTimeout(() => inp.focus(), 50);
    const btn = document.getElementById('login-btn');
    if (btn) btn.onclick = doLogin;
    const pass = document.getElementById('login-pass');
    if (pass) pass.onkeydown = e => { if (e.key === 'Enter') doLogin(); };
  } else {
    form.innerHTML = `
      <div class="form-group">
        <label>Username</label>
        <input type="text" id="reg-user" class="form-input" autocomplete="off" placeholder="Min 3 characters" autofocus>
      </div>
      <div class="form-group">
        <label>Display Name</label>
        <input type="text" id="reg-name" class="form-input" placeholder="Your name">
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" id="reg-pass" class="form-input" autocomplete="new-password" placeholder="Min 4 characters">
      </div>
      <button class="auth-btn" id="reg-btn">Create Account</button>
    `;
    const el = document.getElementById('reg-user');
    if (el) setTimeout(() => el.focus(), 50);
    const btn = document.getElementById('reg-btn');
    if (btn) btn.onclick = doRegister;
  }
  form.style.animation = 'authFadeIn 0.3s ease both';
}

function showAuthError(m) {
  const el = document.getElementById('auth-error');
  if (!el) return;
  el.textContent = m;
  el.style.display = 'block';
  el.style.animation = 'none';
  void el.offsetHeight;
  el.style.animation = 'shake 0.35s ease both';
}

async function doLogin() {
  const u = qs('#login-user')?.value.trim();
  const p = qs('#login-pass')?.value;
  if (!u || !p) { showAuthError('Fill all fields'); return; }
  const btn = document.getElementById('login-btn');
  if (!btn) return;
  btn.disabled = true; btn.textContent = 'Signing in…';
  try {
    const res = await api.login(u, p);
    afterAuth(res);
  } catch (e) { showAuthError(e.message); btn.disabled = false; btn.textContent = 'Sign In'; }
}

async function doRegister() {
  const u = qs('#reg-user')?.value.trim();
  const dn = qs('#reg-name')?.value.trim();
  const p = qs('#reg-pass')?.value;
  if (!u || u.length < 3) { showAuthError('Username must be at least 3 characters'); return; }
  if (!p || p.length < 4) { showAuthError('Password must be at least 4 characters'); return; }
  const btn = document.getElementById('reg-btn');
  if (!btn) return;
  btn.disabled = true; btn.textContent = 'Creating account…';
  try {
    const res = await api.register(u, p, dn || u);
    afterAuth(res);
  } catch (e) { showAuthError(e.message); btn.disabled = false; btn.textContent = 'Create Account'; }
}

function afterAuth(res) {
  saveAuth(res.token, res.user);
  state.user = res.user;
  setToken(res.token);
  if (initAppFn) initAppFn();
}

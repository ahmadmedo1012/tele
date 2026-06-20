/* ── Modal & Menu utilities ── */
import { mk } from '../js/dom.js';

export function showModal(title, body) {
  window.closeModal?.();
  const ov = mk('div', { class: 'modal-overlay show', id: 'modal-overlay' });
  ov.onclick = e => { if (e.target === ov) window.closeModal(); };
  ov.innerHTML = `<div class="modal"><h2>${title}</h2>${body}</div>`;
  document.body.appendChild(ov);
  window.closeModal = () => {
    const el = document.getElementById('modal-overlay');
    if (el) el.remove();
    window.closeModal = null;
  };
  const fi = ov.querySelector('input,textarea');
  if (fi) setTimeout(() => fi.focus(), 100);
}

export function closeModal() {
  window.closeModal?.();
}

export function showMenu(anchor, items) {
  closeMenu();
  const ov = mk('div', { class: 'menu-overlay show' });
  ov.onclick = closeMenu;
  document.body.appendChild(ov);
  const menu = mk('div', { class: 'menu show' });
  items.filter(i => i.show !== false).forEach(item => {
    const btn = mk('div', { class: 'menu-item' + (item.danger ? ' danger' : '') });
    btn.textContent = item.label;
    btn.onclick = item.action;
    menu.appendChild(btn);
  });
  const rect = anchor.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.top = Math.min(rect.bottom + 4, window.innerHeight - 40) + 'px';
  menu.style.left = Math.max(0, Math.min(rect.right - 180, window.innerWidth - 190)) + 'px';
  document.body.appendChild(menu);
}

export function closeMenu() {
  document.querySelectorAll('.menu-overlay, .menu').forEach(el => el.remove());
}

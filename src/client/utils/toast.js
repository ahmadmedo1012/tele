/* ── Toast notification system ── */
let container = null;
let toastId = 0;

function ensureContainer() {
  if (!container || !document.body.contains(container)) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = `
      position: fixed; bottom: 24px; right: 24px; z-index: 9999;
      display: flex; flex-direction: column; gap: 8px;
      max-width: 360px; pointer-events: none;
    `;
    document.body.appendChild(container);
    // Inject toast styles
    if (!document.getElementById('toast-styles')) {
      const s = document.createElement('style');
      s.id = 'toast-styles';
      s.textContent = `
        .toast-msg {
          pointer-events: auto;
          padding: 10px 16px;
          border-radius: 12px;
          font-size: 0.85rem;
          font-weight: 500;
          line-height: 1.4;
          background: var(--glass-bg, rgba(17,17,34,0.95));
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid var(--glass-border-strong, rgba(255,255,255,0.08));
          color: var(--text, #eee);
          box-shadow: 0 8px 32px rgba(0,0,0,0.4);
          animation: toastIn 0.25s cubic-bezier(0.16,1,0.3,1) both;
          display: flex; align-items: center; gap: 8px;
          max-width: 100%;
        }
        .toast-msg.error { border-color: rgba(252,129,129,0.3); background: rgba(252,129,129,0.12); }
        .toast-msg.success { border-color: rgba(104,211,145,0.3); background: rgba(104,211,145,0.12); }
        .toast-msg.warning { border-color: rgba(246,173,85,0.3); background: rgba(246,173,85,0.12); }
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(12px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes toastOut {
          from { opacity: 1; transform: translateY(0) scale(1); }
          to { opacity: 0; transform: translateY(-8px) scale(0.95); }
        }
      `;
      document.head.appendChild(s);
    }
  }
  return container;
}

const emojiMap = {
  error: '⚠️',
  success: '✅',
  warning: '🔔',
  info: 'ℹ️',
};

export function toast(message, type = 'info', duration = 3500) {
  const c = ensureContainer();
  const id = ++toastId;
  const div = document.createElement('div');
  div.className = `toast-msg${type !== 'info' ? ' ' + type : ''}`;
  div.id = `toast-${id}`;
  div.innerHTML = `<span>${emojiMap[type] || 'ℹ️'}</span><span>${message}</span>`;
  c.appendChild(div);
  if (duration > 0) {
    setTimeout(() => {
      const el = document.getElementById(`toast-${id}`);
      if (el) {
        el.style.animation = 'toastOut 0.2s ease both';
        setTimeout(() => el.remove(), 250);
      }
    }, duration);
  }
  return id;
}

// Shorthand replacements for alert()
export function alertError(msg) { toast(msg, 'error'); }
export function alertSuccess(msg) { toast(msg, 'success'); }
export function alertInfo(msg) { toast(msg, 'info'); }
export function alertWarn(msg) { toast(msg, 'warning'); }

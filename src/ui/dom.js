// Tiny DOM helpers: element builder, modal sheet, focus handling.

const BOOLEAN_PROPS = new Set(['disabled', 'checked', 'hidden', 'selected', 'readOnly']);

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'html') el.innerHTML = value;
    else if (key === 'style') el.setAttribute('style', value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (BOOLEAN_PROPS.has(key)) el[key] = !!value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

// A bottom sheet. Escape and the backdrop close it when `dismissible`.
export function modal(content, { label = 'Dialog', dismissible = true, onClose } = {}) {
  const previous = document.activeElement;
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': label }, content);
  const overlay = h('div', { class: 'overlay' }, sheet);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    if (previous && previous.focus) previous.focus();
    if (onClose) onClose();
  };
  const onKey = e => {
    if (e.key === 'Escape' && dismissible) close();
    if (e.key === 'Tab') {
      const items = [...sheet.querySelectorAll(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
    }
  };
  overlay.addEventListener('click', e => { if (e.target === overlay && dismissible) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  const firstFocusable = sheet.querySelector(FOCUSABLE);
  (firstFocusable || sheet).focus?.();
  return { close, sheet };
}

export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

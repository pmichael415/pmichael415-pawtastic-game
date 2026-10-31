// The app shell: screen router, storage banner, toasts and modals.

import { h, modal, reducedMotion } from './dom.js';
import { effectsEnabled } from '../audio/settings.js';

export function createApp(root, services, screens) {
  let cleanup = null;
  let toastTimer = null;
  const banner = services.storagePersistent
    ? null
    : h('p', { class: 'banner', role: 'status' }, "Progress won't be saved on this device.");
  const view = h('div', { class: 'view', style: 'display:flex;flex-direction:column;flex:1' });
  root.replaceChildren(...(banner ? [banner] : []), view);

  // Celebration effects follow the setting (and reduce-motion when it is 'auto').
  const effectsOn = () => (services.settings ? effectsEnabled(services.settings.get(), reducedMotion()) : !reducedMotion());
  const syncFx = () => document.documentElement.classList.toggle('fx-off', !effectsOn());
  services.settings?.onChange(syncFx);
  syncFx();

  const app = {
    services,
    view,
    current: null,
    go(name, params = {}) {
      if (typeof cleanup === 'function') cleanup();
      cleanup = null;
      view.replaceChildren();
      app.current = name;
      const screen = screens[name];
      if (!screen) throw new Error(`Unknown screen: ${name}`);
      cleanup = screen(app, params);
      view.classList.remove('page-enter');
      void view.offsetWidth;
      view.classList.add('page-enter');
      services.onScreen?.(name);
      window.scrollTo?.(0, 0);
    },
    // `action` ({ label, run }) adds a button, e.g. "Try again"; such toasts stay a little longer.
    toast(text, { action } = {}) {
      document.querySelector('.toast')?.remove();
      clearTimeout(toastTimer);
      const el = h('div', { class: 'toast', role: 'status' }, text,
        action ? h('button', { class: 'toast-action', type: 'button', onClick: () => { el.remove(); action.run(); } }, action.label) : null);
      document.body.append(el);
      toastTimer = setTimeout(() => el.remove(), action ? 6000 : 2800);
    },
    modal(content, opts) {
      return modal(content, opts);
    },
    effects: effectsOn,
  };
  return app;
}

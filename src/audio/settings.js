// Sound and effects settings, remembered per device (separate from the wallet).
// `effects`: 'auto' follows the phone's reduce-motion setting; 'on' / 'off' override it.

export const SETTINGS_KEY = 'pawtastic-gd-settings-v1';
export const DEFAULT_SETTINGS = { music: true, sfx: true, effects: 'auto' };

const EFFECTS = ['auto', 'on', 'off'];

function clean(raw) {
  const out = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  if (typeof raw.music === 'boolean') out.music = raw.music;
  if (typeof raw.sfx === 'boolean') out.sfx = raw.sfx;
  if (EFFECTS.includes(raw.effects)) out.effects = raw.effects;
  return out;
}

export function createSoundSettings(storage) {
  let loaded = null;
  try { loaded = storage.load(); } catch { loaded = null; }
  let current = clean(loaded);
  const listeners = new Set();

  return {
    get: () => ({ ...current }),
    set(patch) {
      current = clean({ ...current, ...patch });
      try { storage.save(current); } catch { /* blocked storage: keep it in memory */ }
      for (const fn of listeners) fn({ ...current });
      return { ...current };
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export function effectsEnabled(settings, reducedMotion) {
  if (settings.effects === 'on') return true;
  if (settings.effects === 'off') return false;
  return !reducedMotion;
}

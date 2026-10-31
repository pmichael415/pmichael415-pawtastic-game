// Finished-level results waiting to reach the server. Kept in this phone's storage so a
// dropped connection (or a closed tab) never loses a result; resending is safe because the
// server counts each attempt once.

export const QUEUE_KEY = 'pawtastic-gd-pending-v1';

const valid = e => e && typeof e.attemptId === 'string' && Number.isInteger(e.levelId) && typeof e.won === 'boolean';

export function createAttemptQueue(storage) {
  let items;
  try {
    const saved = storage.load();
    items = Array.isArray(saved) ? saved.filter(valid) : [];
  } catch {
    items = [];
  }
  const save = () => {
    try { storage.save(items); } catch { /* blocked storage: memory only for this visit */ }
  };
  return {
    add(entry) {
      if (!items.some(e => e.attemptId === entry.attemptId)) items.push({ ...entry });
      save();
    },
    all: () => items.map(e => ({ ...e })),
    remove(attemptId) {
      items = items.filter(e => e.attemptId !== attemptId);
      save();
    },
  };
}

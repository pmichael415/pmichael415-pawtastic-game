// TEST STAND-IN, served only by tools/mock-pay-server.mjs. Not Lovable's module: the real
// /owner-save-client.js (save v2: revisions, conflict choice, backups) lives in the Graduation repo's public/.
// It keeps the game's own save behaviour (the doc src/net/pay-api.js made before Lovable's hooks), so the
// built page boots and saves against the mock server exactly as it did before the hooks.
export const OWNER_SAVE_CLIENT = 2;
export function createAccountDoc({ call }) {
  return {
    async get() {
      const r = await call('GET', '/api/public/game/save');
      if (!r.ok) throw new Error(r.error);
      return { exists: !!r.exists && r.data != null, data: () => r.data, forceAccount: false };
    },
    async set(value) {
      const r = await call('PUT', '/api/public/game/save', { data: value });
      if (!r.ok) throw new Error(r.error);
    },
    async review() { return 'local'; },
  };
}

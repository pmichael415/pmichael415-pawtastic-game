// The `api` the server backend talks through. Three implementations share this shape:
//   src/net/supabase-api.js    production (supabase-js against the customer app's database)
//   src/net/http-test-api.js   browser runs against tools/test-server.mjs (debug only)
//   test/helpers/pglite-api.js Node tests against PGlite
//
//   api.rpc(name, args)   → Promise<{ data, error: null } | { data: null, error: { kind, message } }>
//   api.invoke(fn, body)  → same shape (edge functions)
//   api.auth.session()                       → Promise<{ userId, email } | null>
//   api.auth.signInWithPassword(email, pw)   → Promise<{ ok, error? }>
//   api.auth.verifyMagicLink(tokenHash)      → Promise<{ ok, error? }>
//   api.auth.signOut()                       → Promise<void>
//
// error.kind is one of 'offline' | 'signed-out' | 'server'.

// Sorts a thrown or returned error into the three kinds the game handles.
export function errorKind(e, { online = globalThis.navigator?.onLine ?? true } = {}) {
  if (!online) return 'offline';
  const status = e?.status ?? e?.context?.status;
  const text = `${e?.name ?? ''} ${e?.message ?? ''} ${e?.code ?? ''}`;
  // 42501: a session whose refresh token was revoked runs as anon, which may not call game functions.
  if (status === 401 || /PGRST30[13]|JWT|not authenticated|refresh token|42501/i.test(text)) return 'signed-out';
  // FunctionsFetchError: supabase-js's wrapper when an edge function can't be reached.
  if (/Failed to fetch|NetworkError|Load failed|fetch failed|ECONNREFUSED|ENOTFOUND|FunctionsFetchError/i.test(text)) return 'offline';
  return 'server';
}

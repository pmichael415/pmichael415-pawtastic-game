// Review build only: no backend. Sign-in and cloud saves report that they're unavailable.
const off = { message: "Sign-in and cloud saves are turned off in this private review build." };
export const supabase = {
  auth: {
    onAuthStateChange: (cb: (e: string, s: null) => void) => {
      setTimeout(() => cb("INITIAL_SESSION", null), 0);
      return { data: { subscription: { unsubscribe() {} } } };
    },
    getSession: async () => ({ data: { session: null }, error: null }),
    signInWithPassword: async () => ({ data: { session: null, user: null }, error: off }),
    signUp: async () => ({ data: { session: null, user: null }, error: off }),
    signOut: async () => ({ error: null }),
  },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: off }) }) }) }),
  rpc: async () => ({ data: null, error: off }),
};

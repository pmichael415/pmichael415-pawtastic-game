// Review build only: email updates are off (no server, no addresses).
export const emailUpdatesAvailable = async () => ({ available: false });
export const getEmailOptIn = async () => ({ available: false, on: false, email: null as string | null });
export const setEmailOptIn = async (_: unknown) => ({ ok: false as const, error: "Email updates are off in this review build." });

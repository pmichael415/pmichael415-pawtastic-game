// Review build only: purchases are always locked; ownership can never be granted here.
export const getPaymentsStatus = async () => ({ ready: false, reason: "Private review build — purchases are turned off" });
export const listEntitlements = async (): Promise<{ product_id: string; granted_at: string }[]> => { throw new Error("offline"); };
export const createCheckout = async (_: unknown) => ({ ok: false as const, error: "Purchases are turned off in this review build." });
// Nothing is ever delivered in the review build (no server, no purchases).
export const reserveDeliveries = async (_: unknown): Promise<never[]> => [];
export const ackDeliveries = async (_: unknown) => ({ acked: [] as string[] });

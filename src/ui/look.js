// How the player's dog looks right now (owner, 10 Nov 2026): the dog from the wallet, its costume and its worn season
// skin. Every place that draws "your dog" uses this, so a skin shows everywhere.
export function dogLook(state) {
  const dog = state?.dog ?? null;
  return { ...(dog ?? {}), costume: state?.inventory?.equipped ?? null, skin: state?.inventory?.skin ?? null, label: dog?.name ?? 'Your dog' };
}

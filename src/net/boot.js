// Server-mode start-up: sign in (from a hand-off code or an existing session), check access,
// load the player, and settle the dog. Returns which screen to show first:
//   { screen: 'signin', reason? } | { screen: 'gate', reason } | { screen: 'pick-dog', backend } | { screen: 'loading', backend }

import { createServerBackend } from './server-backend.js';
import { readHandoffCode, stripHandoff } from './handoff.js';
import { lookForBreed } from './breed.js';
import { COATS } from '../ui/art.js';

const GATES = new Set(['game-off', 'pilot-only', 'not-customer', 'offline', 'server']);

async function redeemHandoff(api, code) {
  const { data, error } = await api.invoke('game-handoff', { action: 'redeem', code });
  if (error?.kind === 'offline') return 'offline';
  if (error || !data?.token_hash) return 'expired';
  if (await api.auth.session()) await api.auth.signOut(); // a shared tablet: whoever tapped Play wins
  const verified = await api.auth.verifyMagicLink(data.token_hash);
  return verified.ok ? null : 'expired';
}

export async function bootServer({ api, loc, hist, queue, inPlay, now = () => Date.now(), onSignedOut, onGameOff }) {
  const code = readHandoffCode(loc.hash);
  if (code) {
    stripHandoff(loc, hist);
    const problem = await redeemHandoff(api, code);
    if (problem) return { screen: 'signin', reason: problem };
  }
  if (!(await api.auth.session())) return { screen: 'signin' };

  const backend = createServerBackend({ api, queue, inPlay, now });
  backend.setHooks({ signedOut: onSignedOut, gameOff: onGameOff });
  let loaded = await backend.load();
  if (!loaded.ok && loaded.error === 'not-customer') {
    // As in the customer app: link an unclaimed customer record with this account's email.
    await api.rpc('resolve_my_owner', {});
    loaded = await backend.load();
  }
  if (!loaded.ok) {
    if (loaded.error === 'signed-out') return { screen: 'signin' };
    return { screen: 'gate', reason: GATES.has(loaded.error) ? loaded.error : 'server' };
  }

  if (!backend.state().dog) {
    const dogs = backend.dogs();
    if (dogs.length !== 1) return { screen: 'pick-dog', backend };
    const [dog] = dogs;
    const picked = await backend.setDog({ dogId: dog.id, name: dog.name, breed: lookForBreed(dog.breed), coat: COATS[0].hex });
    if (!picked.ok) return { screen: 'gate', reason: GATES.has(picked.error) ? picked.error : 'server' };
  }
  return { screen: 'loading', backend };
}

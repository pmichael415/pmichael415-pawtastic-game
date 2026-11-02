// Turns the server's player JSON (game_player_json) into the wallet-shaped state the
// screens already read, so the same screens work with either backend.

import { LIVES } from '../economy/catalog.js';

const INACTIVE_PASS = { active: false, autoRenew: false, startedOn: null, renewsOn: null, month: null, points: 0, claimedFree: [], claimedPremium: [], countedDay: null, countedToday: 0 };

// Lives as of `now`: the server decides at level start, but the count shown keeps ticking up.
export function projectLives(player, now) {
  if (player.lives >= LIVES.max || !player.lives_next_at) return { count: Math.min(player.lives, LIVES.max), nextInMs: null };
  const next = Date.parse(player.lives_next_at);
  if (now < next) return { count: player.lives, nextInMs: next - now };
  const gained = 1 + Math.floor((now - next) / LIVES.regenMs);
  const count = Math.min(LIVES.max, player.lives + gained);
  return { count, nextInMs: count >= LIVES.max ? null : next + gained * LIVES.regenMs - now };
}

function chosenDog(player, dogs) {
  const look = { breed: player.look.breed, coat: player.look.coat };
  // Staff (no dogs on file) play with a cartoon pup.
  if (!dogs.length) return { dogId: null, name: 'Your pup', photoUrl: null, ...look };
  const dog = dogs.find(d => d.id === player.dog_id);
  return dog ? { dogId: dog.id, name: dog.name, photoUrl: dog.photo_url ?? null, ...look } : null;
}

export function toWalletState(player, dogs, now) {
  const lives = projectLives(player, now);
  return {
    dog: chosenDog(player, dogs),
    treats: { free: player.treats, converted: 0, paid: 0 },
    lives: { count: lives.count, nextInMs: lives.nextInMs },
    inventory: { boosters: { ...player.boosters }, costumes: [...player.costumes], equipped: player.equipped },
    progress: { unlocked: player.unlocked, levels: structuredClone(player.levels), badges: [...player.badges] },
    streak: { day: player.streak_day, lastOpenDay: player.streak_last_day },
    seenIntros: [...player.seen_intros],
    // Purchase-only parts of the demo wallet, inactive in this release.
    demoCoins: 0,
    pass: { ...INACTIVE_PASS },
    starterPack: { bought: false, offerShown: true },
    spending: [],
    spendingLimit: null,
    activeLevel: null,
  };
}

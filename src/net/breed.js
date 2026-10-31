// Picks the closest of the six cartoon looks for the breed on file. The first match wins;
// anything unrecognised (or blank) gets the lab look, which the player can still change.

const LOOKS = [
  [/doodle|poodle|bichon/i, 'poodle'],
  [/golden/i, 'golden'],
  [/french|bulldog|pug|boston/i, 'frenchie'],
  [/beagle|hound|basset/i, 'beagle'],
  [/husky|malamute|shepherd|akita/i, 'husky'],
];

export function lookForBreed(text) {
  const breed = String(text ?? '');
  return LOOKS.find(([pattern]) => pattern.test(breed))?.[1] ?? 'lab';
}

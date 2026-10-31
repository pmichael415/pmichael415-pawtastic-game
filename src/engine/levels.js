// The school year: five areas named after PAWtastic's real services, 8 levels each.
// `moves` are tuned with `npm run sim -- --tune` and `stars` with `npm run sim -- --stars` (tools/simulate.js).

export const AREAS = [
  { id: 'orientation', name: 'Orientation', first: 1, last: 8, service: 'Front desk and evaluation day', costume: 'student-id-collar' },
  { id: 'recess', name: 'Recess Yard', first: 9, last: 16, service: 'Daycare', costume: 'recess-bandana' },
  { id: 'spa', name: 'Ivy-League Spa', first: 17, last: 24, service: 'Recess Rinse-Off and Ivy-League Wash', costume: 'spa-robe' },
  { id: 'dorms', name: 'Dorms & Graduate Suites', first: 25, last: 32, service: 'Boarding (Dorm Room, Graduate Suite)', costume: 'pajamas' },
  { id: 'graduation', name: 'Graduation', first: 33, last: 40, service: 'The final exam', costume: 'cap-and-gown' },
];

const HARD_LEVELS = new Set([10, 15, 20, 25, 30, 35, 40]);

// Board shapes for the later areas ('#' = no cell).
const SHAPES = {
  corners: ['##....##', '#......#', '........', '........', '........', '........', '#......#', '##....##'],
  hole: ['........', '........', '........', '...##...', '...##...', '........', '........', '........'],
  pillars: ['........', '.#....#.', '........', '##....##', '##....##', '........', '.#....#.', '........'],
  waist: ['........', '........', '#......#', '##....##', '##....##', '#......#', '........', '........'],
};

// Overlay obstacle rows ('.' keeps the cell) onto a shape; blocked cells win.
function shaped(shape, obstacles) {
  return SHAPES[shape].map((row, r) => [...row].map((ch, c) => (ch === '#' ? '#' : obstacles[r][c])).join(''));
}

const S = (target) => ({ type: 'score', target });
const C = (kind, count) => ({ type: 'collect', kind, count });
const MUD = { type: 'mud' };

// [id, kinds, goal, moves, stars, layout?, tip?]
const DEFS = [
  // Orientation — no obstacles
  [1, 4, S(5000), 10, [9000, 11000], null, 'swap'],
  [2, 4, C('bone', 25), 10, [12500, 17500], null, 'zoomie'],
  [3, 4, S(8000), 10, [11500, 14000], null, 'bomb'],
  [4, 4, C('paw', 30), 10, [14500, 20500], null, 'blaster'],
  [5, 5, C('ball', 30), 20, [14500, 18000]],
  [6, 5, S(10000), 16, [12500, 14500]],
  [7, 5, C('frisbee', 30), 19, [14000, 18000]],
  [8, 5, S(12000), 19, [15000, 17500]],
  // Recess Yard — crates
  [9, 5, C('bone', 35), 19, [17500, 22000], ['........', '........', '........', '..cccc..', '..cccc..', '........', '........', '........']],
  [10, 5, S(28000), 19, [30500, 33000], ['........', '.c....c.', '..c..c..', '........', '........', '..c..c..', '.c....c.', '........']],
  [11, 5, C('biscuit', 40), 19, [19500, 24500], ['........', '...cc...', '........', 'c......c', 'c......c', '........', '...cc...', '........']],
  [12, 5, C('paw', 40), 19, [19500, 25000], ['........', '........', 'cc....cc', '........', '........', 'cc....cc', '........', '........']],
  [13, 5, C('ball', 35), 19, [17000, 21500], ['........', '........', '..cCCc..', '........', '........', '..cCCc..', '........', '........']],
  [14, 5, S(18000), 20, [20500, 23000], ['........', '.C....C.', '........', '...cc...', '...cc...', '........', '.C....C.', '........']],
  [15, 5, C('biscuit', 45), 18, [22500, 29000], ['........', '........', '.cCccCc.', '........', '........', '.cCccCc.', '........', '........']],
  [16, 5, C('frisbee', 40), 20, [19500, 24000], ['........', 'C......C', '........', '..cCCc..', '........', '........', 'C......C', '........']],
  // Ivy-League Spa — mud
  [17, 5, MUD, 15, [15500, 20500], ['........', '.mmmmmm.', '.mmmmmm.', '.mmmmmm.', '.mmmmmm.', '.mmmmmm.', '.mmmmmm.', '........']],
  [18, 5, MUD, 18, [16000, 22000], ['........', 'mmmmmmmm', '........', '........', 'mmmmmmmm', '........', 'mmmmmmmm', '........']],
  [19, 5, MUD, 22, [19000, 25500], ['mm....mm', 'mm....mm', '........', '........', '........', '........', 'mm....mm', 'mm....mm']],
  [20, 5, MUD, 14, [20000, 27000], ['........', '........', 'mmmmmmmm', 'mmmmmmmm', 'mmmmmmmm', 'mmmmmmmm', 'mmmmmmmm', 'mmmmmmmm']],
  [21, 6, MUD, 18, [9500, 12500], ['........', '........', '..MMMM..', '..m..m..', '..m..m..', '..MMMM..', '........', '........']],
  [22, 6, MUD, 29, [16000, 19500], ['........', '.M....M.', '..mMMm..', '........', '........', '..mMMm..', '.M....M.', '........']],
  [23, 6, MUD, 38, [20000, 24000], ['..MMMM..', '........', '........', '.mm..mm.', '.mm..mm.', '........', '........', '..MMMM..']],
  [24, 6, MUD, 25, [13500, 16500], ['........', '........', 'mmMMMMmm', '........', '........', 'mmMMMMmm', '........', '........']],
  // Dorms & Graduate Suites — shaped boards, crates and mud
  [25, 5, MUD, 13, [15000, 20000], shaped('corners', ['........', '.mmmmmm.', '..MMMM..', '..MccM..', '..MccM..', '..MMMM..', '.mmmmmm.', '........'])],
  [26, 5, C('bone', 35), 20, [15000, 18500], shaped('hole', ['........', '.c....c.', '........', '........', '........', '........', '.c....c.', '........'])],
  [27, 5, S(18000), 23, [20000, 22000], shaped('pillars', ['........', '........', '..c..c..', '........', '........', '..c..c..', '........', '........'])],
  [28, 5, MUD, 25, [16500, 21500], shaped('waist', ['mm....mm', '........', '........', '..cmmc..', '..cmmc..', '........', '........', 'mm....mm'])],
  [29, 6, C('duck', 25), 22, [11500, 14000], shaped('corners', ['........', '........', '.c....c.', '........', '........', '.c....c.', '........', '........'])],
  [30, 6, MUD, 44, [20000, 23500], shaped('hole', ['MMm..mMM', '........', '..m..m..', '........', '........', '..m..m..', '........', 'MMm..mMM'])],
  [31, 6, C('paw', 25), 27, [11500, 14000], shaped('pillars', ['........', '........', '..CccC..', '........', '........', '..CccC..', '........', '........'])],
  [32, 6, S(14000), 28, [15500, 17500], shaped('waist', ['........', '.c....c.', '........', '..mmmm..', '..mmmm..', '........', '.c....c.', '........'])],
  // Graduation — the final exam
  [33, 6, MUD, 32, [15000, 17000], shaped('pillars', ['........', '........', '..mmmm..', '........', '........', '..mmmm..', '........', '.m....m.'])],
  [34, 6, C('biscuit', 30), 27, [14000, 17000], shaped('corners', ['........', '..c..c..', '........', '.C....C.', '.C....C.', '........', '..c..c..', '........'])],
  [35, 6, MUD, 35, [18000, 21000], shaped('waist', ['mmmmmmmm', '........', '..c..c..', '..mmmm..', '..mmmm..', '..c..c..', '........', 'mmmmmmmm'])],
  [36, 6, S(16000), 38, [17500, 20000], shaped('hole', ['........', '..cCCc..', '........', '........', '........', '........', '..cCCc..', '........'])],
  [37, 6, C('ball', 30), 32, [14500, 17500], shaped('pillars', ['.c....c.', '........', '...CC...', '........', '........', '...CC...', '........', '.c....c.'])],
  [38, 6, MUD, 34, [15500, 19000], shaped('corners', ['........', '.MMMMMM.', '.m....m.', '.m.cc.m.', '.m.cc.m.', '.m....m.', '.MMMMMM.', '........'])],
  [39, 6, C('frisbee', 30), 30, [13500, 17000], shaped('waist', ['........', '.C....C.', '........', '..cccc..', '..cccc..', '........', '.C....C.', '........'])],
  [40, 6, MUD, 50, [22500, 26500], shaped('hole', ['MMMMMMMM', 'mmmmmmmm', '..c..c..', '........', '........', '..c..c..', 'mmmmmmmm', 'MMMMMMMM'])],
];

export const LEVELS = DEFS.map(([id, kinds, goal, moves, stars, layout, tip]) => {
  const area = AREAS.find(a => id >= a.first && id <= a.last).id;
  const level = { id, area, moves, kinds, goal, stars };
  if (layout) level.layout = layout;
  if (tip) level.tip = tip;
  return level;
});

export function getLevel(id) {
  return LEVELS[id - 1];
}

export function areaOf(id) {
  return AREAS.find(a => id >= a.first && id <= a.last);
}

export function isHardLevel(id) {
  return HARD_LEVELS.has(id);
}

export function winBand(id) {
  if (isHardLevel(id)) return [0.25, 0.35];
  if (id <= 8) return [0.9, 1];
  if (id <= 24) return [0.6, 0.8];
  return [0.4, 0.6];
}

// Star targets: the share of a typical player's wins that should earn at least 2 stars, and 3 stars.
// Generous in Orientation so new players see 3 stars early; harder levels ask for more.
export function starShares(id) {
  if (isHardLevel(id)) return { two: 0.6, three: 0.25 };
  if (id <= 8) return { two: 0.8, three: 0.5 };
  return { two: 0.7, three: 0.35 };
}

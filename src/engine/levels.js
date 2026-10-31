// Two adventures of five areas, 8 levels each. The school year (1–40) is named after PAWtastic's real
// services; PAWtastic Summer Camp (41–80) opens after Graduation.
// `moves` are tuned with `node tools/simulate.mjs --tune` and `stars` with `--stars`.

export const CHAPTERS = [
  { id: 'academy', name: 'PAWtastic Academy', first: 1, last: 40 },
  { id: 'camp', name: 'PAWtastic Summer Camp', first: 41, last: 80 },
  // Home-location adventures: each player plays the one for the PAWtastic they picked (Hawthorne or Hillsdale).
  // They open after Orientation (level 8) and run alongside the main road.
  { id: 'hawthorne', name: 'Hawthorne Adventure', first: 101, last: 116, location: 'hawthorne', opensAfter: 8 },
  { id: 'hillsdale', name: 'Hillsdale Adventure', first: 201, last: 216, location: 'hillsdale', opensAfter: 8 },
];
export const LOCATIONS = { hawthorne: 'Hawthorne', hillsdale: 'Hillsdale' };

export const AREAS = [
  { id: 'orientation', name: 'Orientation', first: 1, last: 8, service: 'Front desk and evaluation day', costume: 'student-id-collar' },
  { id: 'recess', name: 'Recess Yard', first: 9, last: 16, service: 'Daycare', costume: 'recess-bandana' },
  { id: 'spa', name: 'Ivy-League Spa', first: 17, last: 24, service: 'Recess Rinse-Off and Ivy-League Wash', costume: 'spa-robe' },
  { id: 'dorms', name: 'Dorms & Graduate Suites', first: 25, last: 32, service: 'Boarding (Dorm Room, Graduate Suite)', costume: 'pajamas' },
  { id: 'graduation', name: 'Graduation', first: 33, last: 40, service: 'The final exam', costume: 'cap-and-gown' },
  { id: 'cabins', name: 'Cabin Check-in', first: 41, last: 48, service: 'Front desk check-in', costume: 'camp-bandana' },
  { id: 'lake', name: 'Lake Day', first: 49, last: 56, service: 'Recess Rinse-Off and Ivy-League Wash', costume: 'life-vest' },
  { id: 'trail', name: 'Trail Hike', first: 57, last: 64, service: 'Daycare group play', costume: 'ranger-hat' },
  { id: 'campfire', name: 'Campfire Night', first: 65, last: 72, service: 'Boarding (Dorm Room, Graduate Suite)', costume: 'cozy-flannel' },
  { id: 'talent', name: 'Talent Show', first: 73, last: 80, service: 'Daycare, boarding and grooming', costume: 'camp-medal' },
  { id: 'hawthorne-walk', name: 'Hawthorne Walkabout', first: 101, last: 108, service: 'PAWtastic Hawthorne', costume: 'hawthorne-scarf' },
  { id: 'hawthorne-park', name: 'Hawthorne Park Day', first: 109, last: 116, service: 'PAWtastic Hawthorne', costume: 'hawthorne-jersey' },
  { id: 'hillsdale-trail', name: 'Hillsdale Trailhead', first: 201, last: 208, service: 'PAWtastic Hillsdale', costume: 'hillsdale-scarf' },
  { id: 'hillsdale-parade', name: 'Hillsdale Pup Parade', first: 209, last: 216, service: 'PAWtastic Hillsdale', costume: 'hillsdale-jersey' },
];

const HARD_LEVELS = new Set([10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 108, 116, 208, 216]);

// Board shapes for the later areas ('#' = no cell).
const SHAPES = {
  corners: ['##....##', '#......#', '........', '........', '........', '........', '#......#', '##....##'],
  hole: ['........', '........', '........', '...##...', '...##...', '........', '........', '........'],
  pillars: ['........', '.#....#.', '........', '##....##', '##....##', '........', '.#....#.', '........'],
  waist: ['........', '........', '#......#', '##....##', '##....##', '#......#', '........', '........'],
  tent: ['###..###', '##....##', '#......#', '........', '........', '........', '........', '........'],
  dock: ['........', '........', '........', '........', '###..###', '........', '........', '........'],
  trail: ['##......', '#.......', '........', '........', '........', '........', '.......#', '......##'],
  stage: ['##....##', '#......#', '........', '........', '........', '........', '........', '........'],
};

// Overlay obstacle rows ('.' keeps the cell) onto a shape; blocked cells win.
function shaped(shape, obstacles) {
  return SHAPES[shape].map((row, r) => [...row].map((ch, c) => (ch === '#' ? '#' : obstacles[r][c])).join(''));
}

const S = (target) => ({ type: 'score', target });
const C = (kind, count) => ({ type: 'collect', kind, count });
const MUD = { type: 'mud' };
const LEASH = { type: 'leash' };

// Summer Camp's pieces: Pinecones and Camp Lanterns join the classics; Lake Day brings the Rubber Duck back.
const CAMP5 = ['bone', 'ball', 'paw', 'pinecone', 'lantern'];
const CAMP6 = ['bone', 'ball', 'paw', 'frisbee', 'pinecone', 'lantern'];
const LAKE5 = ['bone', 'ball', 'paw', 'duck', 'lantern'];
const LAKE6 = ['bone', 'ball', 'paw', 'duck', 'pinecone', 'lantern'];

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
  // ---------- PAWtastic Summer Camp ----------
  // Cabin Check-in — new camp pieces and tangled leashes
  [41, CAMP5, C('pinecone', 30), 15, [17500, 22000], null, 'camp'],
  [42, CAMP5, LEASH, 12, [11000, 16500], ['........', '........', '..l..l..', '...ll...', '...ll...', '..l..l..', '........', '........'], 'leash'],
  [43, CAMP5, S(16000), 18, [18000, 20500], shaped('tent', ['........', '........', '........', '...cc...', '...cc...', '........', '........', '........'])],
  [44, CAMP5, C('lantern', 35), 18, [19500, 25500], ['........', '.l....l.', '........', '..llll..', '........', '........', '.l....l.', '........']],
  [45, CAMP5, LEASH, 14, [20000, 28000], ['........', '........', '.LllllL.', '........', '........', '.LllllL.', '........', '........']],
  [46, CAMP5, MUD, 14, [12500, 18500], ['........', '.mm..mm.', '.mmllmm.', '...ll...', '...ll...', '.mmllmm.', '.mm..mm.', '........']],
  [47, CAMP5, C('pinecone', 40), 18, [23500, 29500], ['........', '..c..c..', '.l....l.', '...CC...', '........', '.l....l.', '..c..c..', '........']],
  [48, CAMP5, LEASH, 18, [16500, 22000], shaped('tent', ['........', '........', '..l..l..', '.LL..LL.', '........', '..l..l..', '.l....l.', '........'])],
  // Lake Day — lake mud, the dock and the rubber ducks
  [49, LAKE5, MUD, 17, [19000, 27000], ['........', '........', 'mmmmmmmm', 'mmmmmmmm', 'mmmmmmmm', 'mmmmmmmm', '........', '........']],
  [50, LAKE5, C('duck', 40), 22, [19000, 23000], shaped('dock', ['........', '........', '.c....c.', '........', '........', '.c....c.', '........', '........'])],
  [51, LAKE5, MUD, 27, [16000, 20500], shaped('dock', ['mmmmmmmm', 'm......m', '........', '...ll...', '........', '..mmmm..', '.m....m.', '........'])],
  [52, LAKE6, S(15000), 21, [16500, 19000], ['........', '.l....l.', '..c..c..', '........', '........', '..c..c..', '.l....l.', '........']],
  [53, LAKE6, C('duck', 30), 30, [14500, 18500], shaped('dock', ['........', '..l..l..', '........', '.c....c.', '........', '........', '..l..l..', '........'])],
  [54, LAKE6, LEASH, 31, [18500, 23000], ['........', '.l....l.', '..l..l..', '...LL...', '...LL...', '..l..l..', '.l....l.', '........']],
  [55, LAKE6, MUD, 36, [17500, 21000], shaped('dock', ['..mmmm..', '........', '........', '..c..c..', '........', '........', '........', 'mmmmmmmm'])],
  [56, LAKE6, C('lantern', 30), 26, [16000, 19500], ['........', '..CllC..', '........', 'l......l', 'l......l', '........', '..CllC..', '........']],
  // Trail Hike — winding trails, fallen logs (crates) and leashes
  [57, CAMP5, C('pinecone', 40), 17, [22000, 29000], shaped('trail', ['........', '..c.....', '........', '...cc...', '...cc...', '........', '.....c..', '........'])],
  [58, CAMP5, LEASH, 19, [16500, 22000], shaped('trail', ['........', '..l.....', '...l....', '..LllL..', '..LllL..', '....l...', '.....l..', '........'])],
  [59, CAMP5, MUD, 12, [12500, 16500], shaped('trail', ['........', '.mm.....', '.mmm....', '..mmm...', '...mmm..', '....mmm.', '.....mm.', '........'])],
  [60, CAMP6, C('ball', 30), 23, [15000, 17000], shaped('trail', ['........', '..C..C..', '........', '.l.cc.l.', '.l.cc.l.', '........', '..C..C..', '........'])],
  [61, CAMP6, S(15000), 21, [16500, 17500], shaped('trail', ['........', '.c....c.', '..l..l..', '........', '........', '..l..l..', '.c....c.', '........'])],
  [62, CAMP6, LEASH, 18, [10000, 13000], shaped('trail', ['........', '..l..l..', '........', '.l.cc.l.', '.l.cc.l.', '........', '..l..l..', '........'])],
  [63, CAMP6, C('lantern', 30), 27, [17000, 21000], shaped('trail', ['........', '...cc...', '.c....c.', '..l..l..', '..l..l..', '.c....c.', '...cc...', '........'])],
  [64, CAMP6, MUD, 17, [9500, 12500], shaped('trail', ['........', '.mm.....', '..mmm...', '..lccl..', '..lccl..', '...mmm..', '.....mm.', '........'])],
  // Campfire Night — the fire pit, toasty mud and tangles everywhere
  [65, CAMP6, LEASH, 32, [14500, 17000], shaped('hole', ['........', '.l....l.', '..l..l..', '.l....l.', '.l....l.', '..l..l..', '.l....l.', '........'])],
  [66, CAMP6, C('pinecone', 30), 33, [14500, 18000], shaped('hole', ['........', '..c..c..', '.l....l.', '........', '........', '.l....l.', '..c..c..', '........'])],
  [67, CAMP6, MUD, 39, [18000, 20000], shaped('hole', ['.mmmmmm.', 'm......m', '........', '..m..m..', '..m..m..', '........', 'm......m', '.mmmmmm.'])],
  [68, CAMP6, S(16000), 35, [18500, 20500], shaped('hole', ['.l....l.', '........', '..Cc.C..', '........', '........', '..C.cC..', '........', '.l....l.'])],
  [69, CAMP6, C('lantern', 30), 27, [15500, 18500], shaped('corners', ['........', '..llll..', '.c....c.', '.l....l.', '.l....l.', '.c....c.', '..llll..', '........'])],
  [70, CAMP6, LEASH, 25, [12000, 14500], shaped('hole', ['........', '..l..l..', '..c..c..', '.l....l.', '.l....l.', '..c..c..', '..l..l..', '........'])],
  [71, CAMP6, MUD, 17, [6500, 9500], shaped('pillars', ['........', '.mmmmmm.', '..m..m..', '...ll...', '...ll...', '..m..m..', '.mmmmmm.', '........'])],
  [72, CAMP6, C('frisbee', 30), 32, [13500, 17500], shaped('hole', ['........', '.C....C.', '..l..l..', '.l....l.', '.l....l.', '..l..l..', '.C....C.', '........'])],
  // Talent Show — the big stage: everything at once
  [73, CAMP6, S(16000), 25, [18000, 21500], shaped('stage', ['........', '........', '..c..c..', '.l.ll.l.', '........', '..c..c..', '........', '........'])],
  [74, CAMP6, LEASH, 25, [13000, 15500], shaped('stage', ['........', '........', '..lLLl..', '........', '........', '..lLLl..', '........', '........'])],
  [75, CAMP6, MUD, 20, [12000, 15500], shaped('stage', ['........', '.mmmmmm.', '.mcmmcm.', '.mmllmm.', '.mmllmm.', '.mcmmcm.', '.mmmmmm.', '........'])],
  [76, CAMP6, C('pinecone', 32), 27, [15500, 19000], shaped('stage', ['........', '..CllC..', '........', '.c....c.', '.c....c.', '........', '..CllC..', '........'])],
  [77, CAMP6, LEASH, 29, [17500, 19500], shaped('stage', ['........', '..l..l..', '.l.cc.l.', '...cc...', '.L....L.', '.l....l.', '..l..l..', '........'])],
  [78, CAMP6, C('lantern', 32), 34, [16000, 19500], shaped('waist', ['........', '.l....l.', '..c..c..', '..llll..', '..llll..', '..c..c..', '.l....l.', '........'])],
  [79, CAMP6, MUD, 34, [17000, 21000], shaped('stage', ['mmmmmmmm', '........', '..l..l..', '..mccm..', '..mccm..', '..l..l..', '........', 'mmmmmmmm'])],
  [80, CAMP6, LEASH, 41, [24500, 29500], shaped('stage', ['...LL...', '........', '..l..l..', 'l..LL..l', 'l..LL..l', '..l..l..', '........', '...LL...'])],
  // ---------- Home-location adventures (16 levels each) ----------
  // Hawthorne Walkabout / Park Day
  [101, 5, C('paw', 30), 15, [17500, 23000], ['........', '........', '..c..c..', '........', '........', '..c..c..', '........', '........']],
  [102, 5, MUD, 14, [14000, 19000], ['........', '.mmmmmm.', '........', '..mmmm..', '..mmmm..', '........', '.mmmmmm.', '........']],
  [103, 5, S(14000), 15, [16000, 18000], shaped('corners', ['........', '........', '..c..c..', '...ll...', '...ll...', '..c..c..', '........', '........'])],
  [104, CAMP5, C('lantern', 30), 16, [16000, 21500], ['........', '.l....l.', '........', '...CC...', '...CC...', '........', '.l....l.', '........']],
  [105, 5, LEASH, 13, [12500, 16500], ['........', '..l..l..', '...ll...', '........', '........', '...ll...', '..l..l..', '........']],
  [106, 6, C('frisbee', 30), 30, [14500, 17500], shaped('waist', ['........', '.c....c.', '........', '..llll..', '..llll..', '........', '.c....c.', '........'])],
  [107, 6, MUD, 19, [9500, 11000], shaped('pillars', ['........', '.mmmmmm.', '..mccm..', '........', '........', '..mccm..', '.mmmmmm.', '........'])],
  [108, 6, S(17000), 31, [18500, 20500], shaped('hole', ['.l....l.', '..c..c..', '........', '........', '........', '........', '..c..c..', '.l....l.'])],
  [109, LAKE5, C('duck', 35), 19, [17000, 21500], shaped('dock', ['........', '........', '.c....c.', '........', '........', '.l....l.', '........', '........'])],
  [110, LAKE6, MUD, 29, [17000, 19500], ['........', 'mmmmmmmm', '...ll...', '........', '........', '...ll...', 'mmmmmmmm', '........']],
  [111, CAMP6, LEASH, 36, [18500, 23500], shaped('stage', ['........', '.l....l.', '..lLLl..', '........', '........', '..lLLl..', '.l....l.', '........'])],
  [112, CAMP6, C('pinecone', 30), 31, [16500, 20000], shaped('trail', ['........', '..c.....', '...ll...', '..cCCc..', '..cCCc..', '...ll...', '.....c..', '........'])],
  [113, 6, S(16000), 27, [17500, 19500], shaped('tent', ['........', '........', '..c..c..', '.l....l.', '.l....l.', '..c..c..', '........', '........'])],
  [114, CAMP6, MUD, 30, [15000, 18500], shaped('corners', ['........', '.mmmmmm.', '.m.ll.m.', '.m....m.', '.m....m.', '.m.ll.m.', '.mmmmmm.', '........'])],
  [115, CAMP6, C('lantern', 32), 34, [16500, 20000], shaped('waist', ['..l..l..', '........', '.c....c.', '..CllC..', '..CllC..', '.c....c.', '........', '..l..l..'])],
  [116, CAMP6, LEASH, 22, [10500, 13500], shaped('hole', ['........', '..l..l..', '.l....l.', '..c..c..', '..c..c..', '.l....l.', '..l..l..', '........'])],
  // Hillsdale Trailhead / Pup Parade
  [201, 5, C('bone', 30), 14, [15500, 21000], ['........', '........', '.c....c.', '........', '........', '.c....c.', '........', '........']],
  [202, 5, MUD, 13, [14500, 20000], ['........', '........', 'mmmmmmmm', '........', '........', 'mmmmmmmm', '........', '........']],
  [203, 5, S(14000), 19, [16500, 18500], shaped('waist', ['........', '........', '..l..l..', '...cc...', '...cc...', '..l..l..', '........', '........'])],
  [204, CAMP5, C('pinecone', 30), 16, [18000, 21500], ['........', '..l..l..', '........', '.C....C.', '.C....C.', '........', '..l..l..', '........']],
  [205, 6, LEASH, 29, [17000, 20500], ['........', '.l....l.', '..l..l..', '...ll...', '...ll...', '..l..l..', '.l....l.', '........']],
  [206, 6, C('ball', 30), 28, [15000, 19000], shaped('corners', ['........', '..c..c..', '........', '.l.ll.l.', '........', '........', '..c..c..', '........'])],
  [207, 6, MUD, 34, [15500, 17000], shaped('hole', ['.mmmmmm.', '........', '..m..m..', '..c..c..', '..c..c..', '..m..m..', '........', '.mmmmmm.'])],
  [208, 6, S(17000), 32, [19500, 21500], shaped('pillars', ['........', '..l..l..', '...cc...', '........', '........', '...cc...', '..l..l..', '........'])],
  [209, CAMP5, C('lantern', 35), 16, [20500, 24500], shaped('stage', ['........', '........', '.c....c.', '........', '........', '.l....l.', '........', '........'])],
  [210, CAMP6, MUD, 24, [13500, 15500], ['........', 'mmmmmmmm', '...ll...', '........', '........', '...ll...', 'mmmmmmmm', '........']],
  [211, LAKE6, LEASH, 37, [16000, 19500], shaped('dock', ['........', '.l....l.', '..lLLl..', '........', '........', '..l..l..', '.l....l.', '........'])],
  [212, LAKE6, C('duck', 30), 29, [15000, 17500], shaped('corners', ['........', '...cc...', '.l....l.', '..CllC..', '..CllC..', '.l....l.', '...cc...', '........'])],
  [213, 6, S(16000), 24, [18000, 20000], shaped('trail', ['........', '..c.....', '..l..l..', '.c....c.', '.c....c.', '..l..l..', '.....c..', '........'])],
  [214, CAMP6, MUD, 21, [10000, 12500], shaped('waist', ['........', '.mmmmmm.', '..m..m..', '...ll...', '...ll...', '..m..m..', '.mmmmmm.', '........'])],
  [215, CAMP6, C('frisbee', 32), 31, [17500, 21000], shaped('stage', ['........', '..l..l..', '.c....c.', '..CllC..', '..CllC..', '.c....c.', '..l..l..', '........'])],
  [216, CAMP6, LEASH, 22, [11500, 14500], shaped('pillars', ['........', '..l..l..', '.l....l.', '..c..c..', '..c..c..', '.l....l.', '..l..l..', '........'])],
];

export const ALL_LEVELS = DEFS.map(([id, kinds, goal, moves, stars, layout, tip]) => {
  const area = AREAS.find(a => id >= a.first && id <= a.last).id;
  const level = { id, area, moves, kinds, goal, stars };
  if (layout) level.layout = layout;
  if (tip) level.tip = tip;
  return level;
});
const BY_ID = new Map(ALL_LEVELS.map(l => [l.id, l]));
// The main road (Academy then Summer Camp): levels 1–80, in order.
export const LEVELS = ALL_LEVELS.filter(l => l.id <= 80);

export function getLevel(id) {
  return BY_ID.get(Number(id));
}

/** The level after this one in its own adventure (the main road runs Academy → Summer Camp), or null. */
export function nextLevelId(id) {
  const ch = CHAPTERS.find(c => id >= c.first && id <= c.last);
  if (!ch) return null;
  if (id < ch.last) return id + 1;
  return ch.id === 'academy' ? 41 : null;
}

export const isLocationLevel = id => id > 100;
/** The number players see: location adventures count from 1 (level 105 is "Level 5"). */
export const levelNumber = id => (id > 100 ? id % 100 : id);
export const locationChapter = location => CHAPTERS.find(c => c.location === location) ?? null;

export function areaOf(id) {
  return AREAS.find(a => id >= a.first && id <= a.last);
}

export function chapterOf(id) {
  return CHAPTERS.find(ch => id >= ch.first && id <= ch.last);
}

export const LAST_LEVEL = 80;

export function isHardLevel(id) {
  return HARD_LEVELS.has(id);
}

export function winBand(id) {
  if (isHardLevel(id)) return [0.25, 0.35];
  if (id > 100) return (id % 100) <= 8 ? [0.5, 0.7] : [0.4, 0.55];
  if (id <= 8) return [0.9, 1];
  if (id <= 24) return [0.6, 0.8];
  if (id <= 40) return [0.4, 0.6];
  if (id <= 44) return [0.6, 0.8]; // Summer Camp's first levels ease players into the new pieces
  if (id <= 56) return [0.4, 0.55];
  return [0.35, 0.5];
}

// Star targets: the share of a typical player's wins that should earn at least 2 stars, and 3 stars.
// Generous in Orientation so new players see 3 stars early; harder levels ask for more.
export function starShares(id) {
  if (isHardLevel(id)) return { two: 0.6, three: 0.25 };
  if (id <= 8) return { two: 0.8, three: 0.5 };
  return { two: 0.7, three: 0.35 };
}

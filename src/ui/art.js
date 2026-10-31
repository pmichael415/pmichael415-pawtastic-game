// All game art as inline SVG strings (no image files). Pure functions, so they
// can be tested in Node.

import { PROF_BOX, PROF_CAP, PROF_HEAD } from './prof-paths.js';

export const BREEDS = ['lab', 'golden', 'frenchie', 'beagle', 'poodle', 'husky'];
export const BREED_NAMES = { lab: 'Lab', golden: 'Golden', frenchie: 'Frenchie', beagle: 'Beagle', poodle: 'Poodle', husky: 'Husky' };
export const COATS = [
  { name: 'Caramel', hex: '#C68B59' },
  { name: 'Golden', hex: '#E8C07D' },
  { name: 'Chocolate', hex: '#5A4036' },
  { name: 'Cream', hex: '#F5F1E8' },
  { name: 'Silver', hex: '#8A8D91' },
  { name: 'Red', hex: '#A0522D' },
];

const BRAND = '#0068D6';
const TRIM = '#0055D4'; // costume trim in logo blue
const GOLD = '#F6A823'; // brand reward amber
const INK = '#31271F'; // brand text: eyes, noses, details
const OUTLINE = '#5A4A3E'; // warm brown outline for every dog

// Board pieces in the brand palette; each keeps its own shape for colour-blind players.
export const TILE_COLORS = { paw: '#0068D6', ball: '#45A167', duck: '#F6A823', frisbee: '#DF3A3A', bone: '#F3E3C3', biscuit: '#A8693A', pinecone: '#8B5A2B', lantern: '#7B4FB8' };

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const ch = s => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * (1 + amount))));
  return `#${[16, 8, 0].map(s => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

const svg = (viewBox, label, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${label}">${body}</svg>`;

// ---------- Tiles (100 x 100) ----------

const TILE_NAMES = { bone: 'Bone', ball: 'Tennis Ball', paw: 'PAWtastic Paw', frisbee: 'Frisbee', biscuit: 'Biscuit', duck: 'Rubber Duck', pinecone: 'Pinecone', lantern: 'Camp Lantern' };
const SPECIAL_NAMES = { zoomieH: 'Zoomie (row)', zoomieV: 'Zoomie (column)', bomb: 'Bone Bomb', blaster: 'Bubble Blaster' };

const TILE_BODIES = {
  bone: `<g stroke="#9C7344" stroke-width="4" fill="${TILE_COLORS.bone}">
      <circle cx="26" cy="38" r="12"/><circle cx="26" cy="62" r="12"/><circle cx="74" cy="38" r="12"/><circle cx="74" cy="62" r="12"/>
      <rect x="26" y="40" width="48" height="20" rx="6" stroke="none"/>
      <path d="M30 40 H70 M30 60 H70" fill="none"/></g>`,
  ball: `<circle cx="50" cy="50" r="34" fill="${TILE_COLORS.ball}" stroke="#2A6F43" stroke-width="4"/>
      <path d="M22 34 C40 44 40 56 22 66 M78 34 C60 44 60 56 78 66" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/>`,
  paw: `<g fill="${TILE_COLORS.paw}"><ellipse cx="50" cy="64" rx="22" ry="18"/>
      <ellipse cx="25" cy="42" rx="9" ry="12"/><ellipse cx="41" cy="28" rx="9" ry="12"/><ellipse cx="59" cy="28" rx="9" ry="12"/><ellipse cx="75" cy="42" rx="9" ry="12"/></g>
      <ellipse cx="50" cy="64" rx="22" ry="18" fill="none" stroke="#004A99" stroke-width="3"/>`,
  frisbee: `<ellipse cx="50" cy="52" rx="38" ry="26" fill="${TILE_COLORS.frisbee}" stroke="#A82B20" stroke-width="4"/>
      <ellipse cx="50" cy="48" rx="22" ry="13" fill="#F07C70"/><ellipse cx="50" cy="47" rx="10" ry="5" fill="${TILE_COLORS.frisbee}"/>`,
  biscuit: `<rect x="18" y="20" width="64" height="60" rx="12" fill="${TILE_COLORS.biscuit}" stroke="#7A4A22" stroke-width="4"/>
      <g fill="#7E4B20"><circle cx="34" cy="36" r="4"/><circle cx="50" cy="36" r="4"/><circle cx="66" cy="36" r="4"/>
      <circle cx="34" cy="50" r="4"/><circle cx="50" cy="50" r="4"/><circle cx="66" cy="50" r="4"/>
      <circle cx="34" cy="64" r="4"/><circle cx="50" cy="64" r="4"/><circle cx="66" cy="64" r="4"/></g>`,
  duck: `<path d="M18 62 C18 46 34 44 46 50 C44 30 56 20 68 24 C80 28 82 42 74 50 C86 52 86 74 70 80 H34 C24 80 18 72 18 62 Z" fill="${TILE_COLORS.duck}" stroke="#B9790F" stroke-width="4"/>
      <path d="M78 34 L92 38 L78 44 Z" fill="#F08A24"/><circle cx="66" cy="34" r="4" fill="${INK}"/>`,
  // Summer Camp pieces: a pinecone (brown, scaled teardrop) and a camp lantern (purple, glowing window).
  pinecone: `<path d="M50 12 C70 26 80 46 78 64 C76 82 64 90 50 90 C36 90 24 82 22 64 C20 46 30 26 50 12 Z" fill="${TILE_COLORS.pinecone}" stroke="#5C3A1A" stroke-width="4"/>
      <g fill="none" stroke="#5C3A1A" stroke-width="3" stroke-linecap="round"><path d="M40 30 Q45 36 50 30 Q55 36 60 30"/><path d="M30 46 Q40 54 50 46 Q60 54 70 46"/>
      <path d="M25 62 Q37 70 50 62 Q63 70 75 62"/><path d="M31 77 Q40 84 50 77 Q60 84 69 77"/></g>
      <path d="M50 13 L50 5" stroke="#3E7D3A" stroke-width="5" stroke-linecap="round"/>`,
  lantern: `<path d="M38 22 Q50 6 62 22" fill="none" stroke="#4E2F80" stroke-width="5" stroke-linecap="round"/>
      <rect x="34" y="19" width="32" height="10" rx="3" fill="#4E2F80"/>
      <rect x="27" y="29" width="46" height="52" rx="10" fill="${TILE_COLORS.lantern}" stroke="#4E2F80" stroke-width="4"/>
      <rect x="37" y="37" width="26" height="36" rx="6" fill="#FFE08A"/>
      <path d="M50 44 C57 53 57 62 50 67 C43 62 43 53 50 44 Z" fill="${GOLD}"/>
      <rect x="31" y="80" width="38" height="8" rx="3" fill="#4E2F80"/>`,
};

// A tangled leash over a board piece: one strap for one knot, crossed straps for two.
export function leashSVG(knots) {
  const strap = d => `<path d="${d}" stroke="#08448F" stroke-width="14" fill="none" stroke-linecap="round"/><path d="${d}" stroke="#3F8EF0" stroke-width="8" fill="none" stroke-linecap="round"/><path d="${d}" stroke="#FFFFFF" stroke-width="2" fill="none" stroke-dasharray="3 8" opacity="0.8"/>`;
  const a = 'M8 22 C30 34 70 66 92 78', b = 'M8 78 C30 66 70 34 92 22';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true">${strap(a)}${knots > 1 ? strap(b) : ''}
    <circle cx="50" cy="50" r="11" fill="${BRAND}" stroke="#08448F" stroke-width="4"/>
    <circle cx="10" cy="22" r="6" fill="none" stroke="${GOLD}" stroke-width="4"/></svg>`;
}

const SPECIAL_OVERLAYS = {
  zoomieH: `<g stroke="#FFFFFF" stroke-width="6" stroke-linecap="round" opacity="0.95"><path d="M6 30 H40"/><path d="M60 70 H94"/><path d="M4 50 H24"/><path d="M76 50 H96"/></g>
      <g stroke="${INK}" stroke-width="2" stroke-linecap="round" opacity="0.6"><path d="M6 30 H40"/><path d="M60 70 H94"/></g>`,
  zoomieV: `<g stroke="#FFFFFF" stroke-width="6" stroke-linecap="round" opacity="0.95"><path d="M30 6 V40"/><path d="M70 60 V94"/><path d="M50 4 V24"/><path d="M50 76 V96"/></g>
      <g stroke="${INK}" stroke-width="2" stroke-linecap="round" opacity="0.6"><path d="M30 6 V40"/><path d="M70 60 V94"/></g>`,
  bomb: `<circle cx="50" cy="50" r="44" fill="none" stroke="${GOLD}" stroke-width="7"/>
      <circle cx="50" cy="50" r="44" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-dasharray="6 8"/>
      <path d="M80 14 l4 -8 l2 9 l8 -3 l-6 7 l8 4 l-9 1 l1 9 l-6 -7" fill="${GOLD}"/>`,
};

const BLASTER = `<defs><radialGradient id="bb" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="#FFFFFF"/><stop offset="0.5" stop-color="#9FD8FF"/><stop offset="1" stop-color="${BRAND}"/></radialGradient></defs>
    <circle cx="50" cy="52" r="34" fill="url(#bb)" stroke="#08448F" stroke-width="4"/>
    <g fill="#FFFFFF" stroke="#7FC4F5" stroke-width="2"><circle cx="20" cy="22" r="9"/><circle cx="82" cy="20" r="7"/><circle cx="86" cy="76" r="9"/><circle cx="16" cy="78" r="6"/></g>
    <ellipse cx="40" cy="40" rx="8" ry="5" fill="#FFFFFF" opacity="0.8"/>`;

export function tileSVG(kind, special) {
  if (special === 'blaster') return svg('0 0 100 100', SPECIAL_NAMES.blaster, BLASTER);
  const name = special ? `${TILE_NAMES[kind]} ${SPECIAL_NAMES[special]}` : TILE_NAMES[kind];
  const label = special === 'bomb' ? `${TILE_NAMES[kind]} Bone Bomb` : name;
  return svg('0 0 100 100', label, TILE_BODIES[kind] + (special ? SPECIAL_OVERLAYS[special] : ''));
}

// ---------- Dogs (200 x 200 portrait) ----------

function ears(breed, coat) {
  const dark = shade(coat, -0.25);
  switch (breed) {
    case 'frenchie': return `<path d="M52 70 L40 18 L84 52 Z M148 70 L160 18 L116 52 Z" fill="${coat}" stroke="${OUTLINE}" stroke-width="4"/><path d="M56 58 L48 30 L74 52 Z M144 58 L152 30 L126 52 Z" fill="#E9A7A0"/>`;
    case 'husky': return `<path d="M54 66 L58 16 L92 50 Z M146 66 L142 16 L108 50 Z" fill="${dark}" stroke="${OUTLINE}" stroke-width="4"/><path d="M62 56 L64 30 L82 50 Z M138 56 L136 30 L118 50 Z" fill="#F4E6E2"/>`;
    case 'beagle': return `<path d="M50 60 C24 70 22 130 40 150 C56 140 62 100 64 72 Z M150 60 C176 70 178 130 160 150 C144 140 138 100 136 72 Z" fill="${dark}" stroke="${OUTLINE}" stroke-width="4"/>`;
    case 'poodle': return `<g fill="${coat}" stroke="${OUTLINE}" stroke-width="3"><circle cx="46" cy="86" r="16"/><circle cx="42" cy="110" r="15"/><circle cx="48" cy="132" r="13"/><circle cx="154" cy="86" r="16"/><circle cx="158" cy="110" r="15"/><circle cx="152" cy="132" r="13"/></g>`;
    case 'golden': return `<path d="M52 62 C26 72 30 128 50 136 C62 126 66 96 68 72 Z M148 62 C174 72 170 128 150 136 C138 126 134 96 132 72 Z" fill="${dark}" stroke="${OUTLINE}" stroke-width="4"/><path d="M40 118 q6 8 12 4 M160 118 q-6 8 -12 4" stroke="${OUTLINE}" stroke-width="3" fill="none"/>`;
    default: return `<path d="M54 62 C32 70 32 112 48 120 C60 112 64 88 68 70 Z M146 62 C168 70 168 112 152 120 C140 112 136 88 132 70 Z" fill="${dark}" stroke="${OUTLINE}" stroke-width="4"/>`;
  }
}

function head(breed, coat) {
  const dark = shade(coat, -0.3);
  const muzzle = breed === 'husky' || breed === 'beagle' ? '#F6F1EA' : shade(coat, 0.25);
  const topknot = breed === 'poodle'
    ? `<g fill="${coat}" stroke="${OUTLINE}" stroke-width="3"><circle cx="84" cy="48" r="16"/><circle cx="100" cy="40" r="18"/><circle cx="116" cy="48" r="16"/></g>` : '';
  const mask = breed === 'husky'
    ? `<path d="M100 66 C78 66 70 86 74 100 C80 92 92 90 100 98 C108 90 120 92 126 100 C130 86 122 66 100 66 Z" fill="#F6F1EA"/>` : '';
  const snoutW = breed === 'frenchie' ? 30 : 26;
  return `<ellipse cx="100" cy="98" rx="52" ry="50" fill="${coat}" stroke="${OUTLINE}" stroke-width="4"/>${topknot}${mask}
    <ellipse cx="100" cy="124" rx="${snoutW}" ry="20" fill="${muzzle}" stroke="${OUTLINE}" stroke-width="3"/>
    <ellipse cx="100" cy="114" rx="10" ry="7" fill="${INK}"/>
    <path d="M100 121 V130 M90 134 Q100 140 110 134" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <circle cx="80" cy="92" r="8" fill="${INK}"/><circle cx="120" cy="92" r="8" fill="${INK}"/>
    <circle cx="83" cy="89" r="2.5" fill="#FFFFFF"/><circle cx="123" cy="89" r="2.5" fill="#FFFFFF"/>`;
}

const NECK = 'M58 150 C70 170 130 170 142 150';

const COSTUME_ART = {
  'bandana': `<path d="M56 148 L144 148 L100 190 Z" fill="#D63A35" stroke="#9E2420" stroke-width="3"/><g fill="#FFFFFF"><circle cx="86" cy="158" r="3"/><circle cx="110" cy="164" r="3"/><circle cx="100" cy="176" r="3"/></g>`,
  'bow-tie': `<path d="M100 160 L70 146 L70 176 Z M100 160 L130 146 L130 176 Z" fill="${TRIM}"/><circle cx="100" cy="160" r="7" fill="${GOLD}"/>`,
  'sunglasses': `<g fill="#1B1B1F" stroke="#1B1B1F" stroke-width="3"><rect x="60" y="80" width="34" height="22" rx="9"/><rect x="106" y="80" width="34" height="22" rx="9"/><path d="M94 88 H106"/></g><path d="M66 86 l10 0" stroke="#FFFFFF" stroke-width="3" opacity="0.6"/>`,
  'raincoat': `<path d="M40 150 C60 186 140 186 160 150 L166 198 H34 Z" fill="#F7C531" stroke="#B88A0F" stroke-width="3"/><path d="M44 74 C44 30 156 30 156 74 C140 54 60 54 44 74 Z" fill="#F7C531" stroke="#B88A0F" stroke-width="3"/>`,
  'academy-hoodie': `<path d="M38 150 C56 190 144 190 162 150 L170 198 H30 Z" fill="${BRAND}" stroke="#08448F" stroke-width="3"/><path d="M38 150 C36 120 50 156 100 168 C150 156 164 120 162 150" fill="#0E57B5"/><text x="100" y="192" text-anchor="middle" font-family="DM Sans, system-ui, sans-serif" font-weight="700" font-size="16" fill="#FFFFFF">PA</text>`,
  'varsity-jacket': `<path d="M36 152 C54 190 146 190 164 152 L170 198 H30 Z" fill="${TRIM}"/><path d="M78 160 L100 186 L122 160" fill="none" stroke="${GOLD}" stroke-width="6"/><circle cx="60" cy="184" r="10" fill="${GOLD}"/><text x="60" y="189" text-anchor="middle" font-family="DM Sans, system-ui, sans-serif" font-weight="700" font-size="13" fill="${TRIM}">P</text>`,
  'superhero-cape': `<path d="M44 150 C30 176 26 194 22 200 H178 C174 194 170 176 156 150 C130 168 70 168 44 150 Z" fill="#D63A35"/><path d="M60 152 Q100 172 140 152" stroke="${GOLD}" stroke-width="5" fill="none"/>`,
  'pumpkin-bandana': `<path d="M56 148 L144 148 L100 190 Z" fill="#F08A24" stroke="#B05E10" stroke-width="3"/><path d="M100 156 q-8 10 0 20 q8 -10 0 -20" fill="#2E7D32"/>`,
  'student-id-collar': `<path d="${NECK}" stroke="${BRAND}" stroke-width="9" fill="none"/><rect x="88" y="166" width="24" height="18" rx="3" fill="#FFFFFF" stroke="${TRIM}" stroke-width="2"/><path d="M92 172 h16 M92 178 h10" stroke="${TRIM}" stroke-width="2"/>`,
  'recess-bandana': `<path d="M56 148 L144 148 L100 190 Z" fill="#2E9E5B" stroke="#1D6B3C" stroke-width="3"/><path d="M76 156 L124 156" stroke="#FFFFFF" stroke-width="3" stroke-dasharray="6 5"/>`,
  'spa-robe': `<path d="M40 150 C58 186 142 186 160 150 L166 198 H34 Z" fill="#FFFFFF" stroke="#C9CED8" stroke-width="3"/><path d="M76 156 L100 196 L124 156" fill="none" stroke="#C9CED8" stroke-width="4"/><path d="M58 50 C70 22 130 22 142 50 C128 44 72 44 58 50 Z" fill="#FFFFFF" stroke="#C9CED8" stroke-width="3"/>`,
  'pajamas': `<path d="M40 150 C58 186 142 186 160 150 L166 198 H34 Z" fill="#7FA8E8"/><path d="M54 170 H146 M46 186 H154" stroke="#FFFFFF" stroke-width="5"/><path d="M60 54 C70 20 140 18 150 40 L172 70 L150 58 C140 46 80 40 60 54 Z" fill="#7FA8E8"/><circle cx="174" cy="72" r="9" fill="#FFFFFF"/>`,
  'cap-and-gown': `<path d="M40 150 C58 186 142 186 160 150 L166 198 H34 Z" fill="#1B1B1F"/><path d="M80 156 L100 176 L120 156" stroke="${GOLD}" stroke-width="4" fill="none"/><path d="M100 18 L162 40 L100 62 L38 40 Z" fill="#1B1B1F"/><rect x="72" y="44" width="56" height="16" fill="#1B1B1F"/><path d="M100 40 L156 46 L156 74" stroke="${GOLD}" stroke-width="3" fill="none"/><circle cx="156" cy="78" r="5" fill="${GOLD}"/>`,
  'gold-collar': `<path d="${NECK}" stroke="${GOLD}" stroke-width="10" fill="none"/><circle cx="100" cy="172" r="8" fill="#5BC0EB" stroke="${GOLD}" stroke-width="3"/>`,
  'letterman-scarf': `<path d="M54 152 C70 172 130 172 146 152" stroke="${TRIM}" stroke-width="16" fill="none"/><path d="M54 152 C70 172 130 172 146 152" stroke="${GOLD}" stroke-width="4" stroke-dasharray="10 10" fill="none"/><rect x="118" y="160" width="16" height="36" fill="${TRIM}"/><path d="M118 172 h16 M118 184 h16" stroke="${GOLD}" stroke-width="4"/>`,
  'camp-bandana': `<path d="M56 148 L144 148 L100 190 Z" fill="#2F6B3A" stroke="#1E4726" stroke-width="3"/><path d="M86 174 L100 158 L114 174 Z" fill="#FFFFFF"/><path d="M100 163 L96 174 H104 Z" fill="#2F6B3A"/><circle cx="100" cy="150" r="6" fill="${GOLD}" stroke="#B88A0F" stroke-width="2"/>`,
  'life-vest': `<path d="M40 150 C50 168 70 176 88 178 L88 198 H34 Z M160 150 C150 168 130 176 112 178 L112 198 H166 Z" fill="#F26B1D" stroke="#B4480C" stroke-width="3"/><path d="M37 187 H88 M112 187 H163" stroke="#1B1B1F" stroke-width="5"/><rect x="84" y="182" width="32" height="10" rx="2" fill="#1B1B1F"/><path d="M50 164 l10 7 M150 164 l-10 7" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round"/>`,
  'ranger-hat': `<ellipse cx="100" cy="54" rx="70" ry="12" fill="#B08B4F" stroke="#7A5E2E" stroke-width="3"/><path d="M68 54 C68 30 80 16 100 14 C120 16 132 30 132 54 Z" fill="#C9A15E" stroke="#7A5E2E" stroke-width="3"/><path d="M100 16 V38 M84 24 L91 40 M116 24 L109 40" stroke="#7A5E2E" stroke-width="3" stroke-linecap="round"/><rect x="69" y="44" width="62" height="8" fill="#2F6B3A"/>`,
  'cozy-flannel': `<path d="M40 150 C58 186 142 186 160 150 L166 198 H34 Z" fill="#C0392B" stroke="#7E2318" stroke-width="3"/><g stroke="#1B1B1F" stroke-width="6" opacity="0.5"><path d="M62 166 V198 M100 176 V198 M138 166 V198"/><path d="M42 182 H158 M37 194 H163"/></g><path d="M74 156 L100 178 L126 156" fill="none" stroke="#7E2318" stroke-width="5"/><circle cx="100" cy="188" r="3" fill="#FFFFFF"/>`,
  'camp-medal': `<path d="M72 148 L100 178 L128 148" fill="none" stroke="${BRAND}" stroke-width="10"/><path d="M72 148 L100 178 L128 148" fill="none" stroke="#DF3A3A" stroke-width="3"/><circle cx="100" cy="183" r="15" fill="${GOLD}" stroke="#B88A0F" stroke-width="3"/><path d="M100 173 l3 6.5 h7 l-5.5 4.3 2.2 7 -6.7 -4.2 -6.7 4.2 2.2 -7 -5.5 -4.3 h7 Z" fill="#FFFFFF"/>`,
  'honor-roll-sash': `<path d="M50 150 L150 196 L136 200 L44 160 Z" fill="${GOLD}" stroke="#B88A0F" stroke-width="2"/><circle cx="110" cy="180" r="8" fill="${BRAND}"/>`,
};

export function dogSVG({ breed = 'lab', coat = COATS[0].hex, costume = null, label = 'Your dog' } = {}) {
  const body = `<path d="M46 150 C60 186 140 186 154 150 L160 200 H40 Z" fill="${coat}" stroke="${OUTLINE}" stroke-width="4"/>`;
  const overlay = costume && COSTUME_ART[costume] ? `<g data-costume="${costume}">${COSTUME_ART[costume]}</g>` : '';
  const collar = costume ? '' : `<path d="${NECK}" stroke="${BRAND}" stroke-width="8" fill="none" stroke-linecap="round"/><circle cx="100" cy="171" r="5" fill="${GOLD}" stroke="${OUTLINE}" stroke-width="2"/>`;
  // Hats and glasses sit on top of the head; neckwear sits on the body.
  const onHead = ['sunglasses', 'cap-and-gown', 'spa-robe', 'pajamas', 'raincoat', 'ranger-hat'].includes(costume);
  return svg('0 0 200 200', label, body + collar + ears(breed, coat) + (onHead ? '' : overlay) + head(breed, coat) + (onHead ? overlay : ''));
}

// Professor Paws is the logo dog itself: logo-blue lines on a white badge, like the logo. One face,
// so moods show as small poses: the cap lifts when cheering, the head tilts when thinking or sympathising.
const LOGO_BLUE = '#0055D4';
const PROF_POSES = {
  happy: { head: '', cap: '' },
  cheer: { head: 'rotate(-3 100 110)', cap: 'translate(0 -12) rotate(-8 100 40)' },
  think: { head: 'rotate(-7 100 110)', cap: '' },
  sympathy: { head: 'rotate(6 100 120) translate(0 4)', cap: 'rotate(4 100 40)' },
};

export function professorPawsSVG({ mood = 'happy' } = {}) {
  const key = PROF_POSES[mood] ? mood : 'happy';
  const pose = PROF_POSES[key];
  const t = v => (v ? ` transform="${v}"` : '');
  const fit = `translate(25 21) scale(${(150 / PROF_BOX.width).toFixed(4)})`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img" aria-label="Professor Paws" data-mood="${key}" data-art="logo-dog">
  <circle cx="100" cy="100" r="93" fill="#FFFFFF" stroke="${LOGO_BLUE}" stroke-width="6"/>
  <g data-part="head"${t(pose.head)}>
    <path transform="${fit}" fill="${LOGO_BLUE}" fill-rule="evenodd" d="${PROF_HEAD}"/>
    <g data-part="cap"${t(pose.cap)}><path transform="${fit}" fill="${LOGO_BLUE}" fill-rule="evenodd" d="${PROF_CAP}"/></g>
  </g>
</svg>`;
}

// The real PAWtastic Academy logo (360px PNG from the customer app).
export const LOGO_SRC = 'static/pawtastic-logo.png';
export function logoImg({ size = 36, alt = 'PAWtastic Academy' } = {}) {
  const img = document.createElement('img');
  img.src = LOGO_SRC;
  img.width = size;
  img.height = size;
  img.alt = alt;
  img.className = 'logo';
  img.decoding = 'async';
  return img;
}

export function jarSVG() {
  return svg('0 0 160 180', 'Treat Jar', `
    <g data-part="lid"><rect x="44" y="8" width="72" height="22" rx="6" fill="${TRIM}"/>
    <rect x="36" y="26" width="88" height="12" rx="4" fill="#00449F"/></g>
    <path d="M30 40 H130 C142 40 146 52 146 64 V150 C146 166 134 174 120 174 H40 C26 174 14 166 14 150 V64 C14 52 18 40 30 40 Z" fill="#DCEBFA" fill-opacity="0.55" stroke="#7FA8E8" stroke-width="4"/>
    <g transform="translate(26 92) scale(0.5)">${TILE_BODIES.bone}</g>
    <g transform="translate(70 104) scale(0.45)">${TILE_BODIES.biscuit}</g>
    <g transform="translate(44 124) scale(0.5)">${TILE_BODIES.bone}</g>
    <g transform="translate(90 126) scale(0.42)">${TILE_BODIES.ball}</g>
    <rect x="44" y="60" width="72" height="26" rx="6" fill="#FFFFFF" stroke="${GOLD}" stroke-width="3"/>
    <text x="80" y="78" text-anchor="middle" font-family="DM Sans, system-ui, sans-serif" font-weight="700" font-size="13" fill="${INK}">TREATS</text>`);
}

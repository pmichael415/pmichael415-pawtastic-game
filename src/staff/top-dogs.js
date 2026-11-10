// "Top Dogs" post for PAWtastic's social accounts (owner, 10 Nov 2026: "do what you think will make us go viral"): the
// staff page draws the current top 3 dog names at each location on a 1080×1350 picture, ready to post. Dog names only
// (already public on the leaderboard); never emails, owners or scores. Hidden players are left out by the caller.

const LOCATION_NAMES = { hawthorne: 'Hawthorne', hillsdale: 'Hillsdale' };
const MAX_NAME = 24;
const clean = (name) => {
  const n = String(name ?? '').replace(/\s+/g, ' ').trim();
  return n.length > MAX_NAME ? `${n.slice(0, MAX_NAME).trimEnd()}…` : n;
};

/** The words on the picture: top 3 per location (best first), "Your pup?" for open places. Pure, so it is tested. */
export function topDogsLines({ seasonName, chapter, boards }) {
  const locations = Object.entries(LOCATION_NAMES).map(([id, name]) => {
    const top = [...(boards?.[id] ?? [])]
      .filter((e) => clean(e?.dogName))
      .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))
      .slice(0, 3)
      .map((e) => clean(e.dogName));
    return { name, dogs: [0, 1, 2].map((i) => `${i + 1}. ${top[i] ?? 'Your pup?'}`) };
  });
  return {
    title: 'Top Dogs',
    subtitle: `${seasonName} · season standings${Number.isInteger(chapter) ? ` in Chapter ${chapter}` : ''}`,
    locations,
    cta: 'Play free at play.pawtasticacademy.com',
    fine: 'No purchase necessary. Top 3 at each location win when the season ends.',
  };
}

const W = 1080, H = 1350;
const BLUE = '#0068D6', INK = '#31271F', CREAM = '#FAF8F5', GOLD = '#F6A823', MUTED = '#6B6058';

/** Draws the post on a canvas (1080×1350). */
export function drawTopDogs(canvas, lines) {
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const font = (w, px) => `${w} ${px}px "DM Sans", system-ui, sans-serif`;
  g.fillStyle = CREAM; g.fillRect(0, 0, W, H);
  g.fillStyle = BLUE; g.fillRect(0, 0, W, 300);
  g.textAlign = 'center'; g.fillStyle = '#FFFFFF';
  g.font = font(700, 34); g.fillText('PAWTASTIC ACADEMY · GRADUATION DAY', W / 2, 92);
  g.font = font(700, 120); g.fillText(lines.title, W / 2, 222);
  g.font = font(500, 34); g.fillStyle = '#DCEBFF'; g.fillText(lines.subtitle, W / 2, 276);
  lines.locations.forEach((loc, i) => {
    const top = 360 + i * 400;
    g.fillStyle = '#FFFFFF'; g.strokeStyle = '#E6DED4'; g.lineWidth = 3;
    roundRect(g, 80, top, W - 160, 360, 36); g.fill(); g.stroke();
    g.textAlign = 'left'; g.fillStyle = BLUE; g.font = font(700, 46); g.fillText(loc.name.toUpperCase(), 130, top + 78);
    loc.dogs.forEach((d, j) => {
      const y = top + 160 + j * 78;
      g.fillStyle = j === 0 ? GOLD : '#DCE3EA'; g.beginPath(); g.arc(150, y - 16, 26, 0, Math.PI * 2); g.fill();
      g.fillStyle = INK; g.font = font(700, 30); g.textAlign = 'center'; g.fillText(String(j + 1), 150, y - 5);
      g.textAlign = 'left'; g.font = font(d.endsWith('Your pup?') ? 500 : 700, 48);
      g.fillStyle = d.endsWith('Your pup?') ? MUTED : INK; g.fillText(d.replace(/^\d+\.\s/, ''), 200, y);
    });
  });
  g.textAlign = 'center'; g.fillStyle = BLUE; g.font = font(700, 44); g.fillText(lines.cta, W / 2, 1210);
  g.fillStyle = MUTED; g.font = font(500, 28); g.fillText(lines.fine, W / 2, 1268);
  return canvas;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

/** Makes the PNG and hands it to the browser as a download (on a phone it opens to save or share). */
export async function downloadTopDogs(lines, doc = document) {
  if (doc.fonts?.ready) await doc.fonts.ready.catch(() => {});
  const canvas = drawTopDogs(doc.createElement('canvas'), lines);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  const a = doc.createElement('a');
  a.href = url; a.download = 'pawtastic-top-dogs.png';
  doc.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
}

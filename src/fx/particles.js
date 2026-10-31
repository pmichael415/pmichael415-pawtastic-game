// Sparkles, paw prints, confetti, rings, streaks and bubbles on one canvas over a host.
// The system is pure (testable in Node); the layer animates only while particles live.

const GRAVITY = 0.0012; // px per ms²
export const MAX_PARTICLES = 150;
const CONFETTI_MAX = 120;
const CONFETTI_COLORS = ['#0055D4', '#FFFFFF', '#F6A823', '#45A167'];

export function createParticleSystem({ max = MAX_PARTICLES } = {}) {
  let list = [];
  return {
    add(particles) {
      list = list.concat(particles);
      if (list.length > max) list = list.slice(list.length - max);
    },
    step(dt) {
      for (const p of list) {
        p.life += dt;
        p.vy += (p.g ?? GRAVITY) * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.vr) p.rot = (p.rot || 0) + p.vr * dt;
      }
      list = list.filter(p => p.life < p.ttl);
    },
    get particles() { return list; },
    get count() { return list.length; },
  };
}

const rand = (a, b) => a + Math.random() * (b - a);

function drawPaw(ctx, x, y, s) {
  ctx.beginPath(); ctx.ellipse(x, y + s * 0.3, s * 0.5, s * 0.4, 0, 0, Math.PI * 2); ctx.fill();
  for (const [dx, dy] of [[-0.55, -0.25], [-0.2, -0.6], [0.2, -0.6], [0.55, -0.25]]) {
    ctx.beginPath(); ctx.ellipse(x + dx * s, y + dy * s, s * 0.18, s * 0.24, 0, 0, Math.PI * 2); ctx.fill();
  }
}

export function createParticleLayer(host, {
  enabled = () => true,
  createCanvas = () => document.createElement('canvas'),
  raf = cb => requestAnimationFrame(cb),
  caf = id => cancelAnimationFrame(id),
} = {}) {
  const fx = (globalThis.__pawtasticFx ??= { loops: 0, drawn: 0 });
  const canvas = createCanvas();
  canvas.className = 'fx-layer';
  canvas.setAttribute('aria-hidden', 'true');
  host.append(canvas);
  const ctx = canvas.getContext('2d');
  const sys = createParticleSystem();
  let frame = null;
  let last = 0;
  let destroyed = false;
  let width = 0, height = 0;

  function size() {
    const r = host.getBoundingClientRect();
    const d = globalThis.devicePixelRatio || 1;
    width = r.width; height = r.height;
    canvas.width = Math.round(width * d);
    canvas.height = Math.round(height * d);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(d, 0, 0, d, 0, 0);
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(size) : null;
  ro?.observe(host);
  size();

  function draw() {
    ctx.clearRect(0, 0, width, height);
    for (const p of sys.particles) {
      const t = p.life / p.ttl;
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      if (p.kind === 'spark') {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 - t * 0.6), 0, Math.PI * 2); ctx.fill();
      } else if (p.kind === 'paw') {
        drawPaw(ctx, p.x, p.y, p.r);
      } else if (p.kind === 'confetti') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0);
        ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
        if (p.color === '#FFFFFF') { ctx.strokeStyle = '#DAE0E7'; ctx.lineWidth = 1; ctx.strokeRect(-p.r, -p.r / 2, p.r * 2, p.r); }
        ctx.restore();
      } else if (p.kind === 'ring') {
        ctx.lineWidth = 4 * (1 - t) + 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r + p.grow * t, 0, Math.PI * 2); ctx.stroke();
      } else if (p.kind === 'streak') {
        ctx.lineWidth = 10 * (1 - t) + 2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x2, p.y2); ctx.stroke();
      } else if (p.kind === 'bubble') {
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.stroke();
      }
      fx.drawn++;
    }
    ctx.globalAlpha = 1;
  }

  function tick(time) {
    if (destroyed) return;
    const dt = last ? Math.min(50, time - last) : 16;
    last = time;
    sys.step(dt);
    draw();
    if (sys.count > 0) {
      frame = raf(tick);
    } else {
      frame = null;
      last = 0;
      fx.loops--;
    }
  }

  function add(particles) {
    if (destroyed || !enabled()) return;
    sys.add(particles);
    if (frame === null) { fx.loops++; frame = raf(tick); }
  }

  return {
    burst(x, y, color, n = 4) {
      add(Array.from({ length: n }, () => {
        const a = rand(0, Math.PI * 2), v = rand(0.08, 0.22);
        return { kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.05, life: 0, ttl: rand(450, 650), r: rand(3, 5), color };
      }));
    },
    paws(x, y, color) {
      add([-1, 1].map(side => ({ kind: 'paw', x: x + side * 8, y, vx: side * 0.03, vy: -0.12, g: 0.0004, life: 0, ttl: 700, r: 7, color })));
    },
    confetti(n = CONFETTI_MAX) {
      add(Array.from({ length: Math.min(n, CONFETTI_MAX) }, () => ({
        kind: 'confetti', x: rand(0, width), y: rand(-40, -5), vx: rand(-0.05, 0.05), vy: rand(0.05, 0.2), g: 0.0003,
        life: 0, ttl: 2500, r: rand(4, 7), rot: rand(0, Math.PI), vr: rand(-0.01, 0.01),
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      })));
    },
    ring(x, y, color) {
      add([{ kind: 'ring', x, y, vx: 0, vy: 0, g: 0, life: 0, ttl: 450, r: 6, grow: 70, color }]);
    },
    streak(x1, y1, x2, y2, color) {
      add([{ kind: 'streak', x: x1, y: y1, x2, y2, vx: 0, vy: 0, g: 0, life: 0, ttl: 350, color }]);
    },
    bubbles(x, y) {
      add(Array.from({ length: 3 }, () => ({
        kind: 'bubble', x: x + rand(-8, 8), y, vx: rand(-0.02, 0.02), vy: -0.05, g: -0.0002, life: 0, ttl: 800, r: rand(4, 8), color: '#7FB8F0',
      })));
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (frame !== null) { caf(frame); frame = null; fx.loops--; }
      ro?.disconnect();
      canvas.remove();
    },
    get active() { return frame !== null; },
    get count() { return sys.count; },
  };
}

// Small math / helper toolbox shared by every subsystem.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
export const rand = (a = 1, b = 0) => b + Math.random() * (a - b);
export const randInt = (a, b) => Math.floor(rand(b + 1, a));
export const choice = (arr) => arr[(Math.random() * arr.length) | 0];
export const deg = (d) => (d * Math.PI) / 180;
export const sign = (v) => (v < 0 ? -1 : 1);

// Gaussian-ish spread: sum of two uniforms, cheap and good enough for recoil.
export const gauss = () => (Math.random() + Math.random() - 1);

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const m = (sec / 60) | 0;
  return `${m}:${String(sec % 60).padStart(2, '0')}`;
}

/** Reusable object pool so the render loop never allocates. */
export class Pool {
  constructor(factory, size) {
    this.items = [];
    for (let i = 0; i < size; i++) this.items.push(factory(i));
    this.cursor = 0;
  }
  next() {
    const it = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;
    return it;
  }
}

const CALLSIGNS = [
  'Woods', 'Mason', 'Hudson', 'Reznov', 'Bowman', 'Weaver', 'Brooks', 'Harris',
  'Kravchenko', 'Dragovich', 'Steiner', 'Clarke', 'Menendez', 'Farid', 'Salazar',
  'Sever', 'Adler', 'Park', 'Sims', 'Lazar', 'Kozlov', 'Volkov', 'Petrenko',
  'Ramirez', 'Foley', 'Dunn', 'Price', 'Ghost', 'Roach', 'Soap',
];

export function callsigns(n, taken = new Set()) {
  const pool = shuffle(CALLSIGNS.filter((c) => !taken.has(c)));
  const out = [];
  for (let i = 0; i < n; i++) out.push(pool[i] ?? `Bot-${i + 1}`);
  return out;
}

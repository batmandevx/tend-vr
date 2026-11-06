// Local-only persistence. No account, no server: health data never leaves the headset.
const KEY = 'tend.v1';

export function dayKey(d = new Date()) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

export function defaultProfile() {
  return {
    created: Date.now(),
    setupDone: false,
    hand: 'right',        // hand being rehabilitated: 'left' | 'right' | 'both'
    mirror: false,        // mirror therapy: show the healthy hand reflected as the affected hand
    length: 'full',       // 'quick' | 'full'
    calib: null,          // { open, fist, restSpread, maxSpread }
    level: { bloom: 0.55, pinch: 0.55, spread: 0.55, turn: 0.5, fireflies: 0.5 },
    sessions: [],         // { day, t, dur, reps, metrics:{...}, plants }
    plants: [],           // [variant, hue, seed]
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultProfile();
    return { ...defaultProfile(), ...JSON.parse(raw) };
  } catch { return defaultProfile(); }
}
export function save(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage full or blocked */ } }
export function reset() { localStorage.removeItem(KEY); }

export function streak(p) {
  const days = new Set(p.sessions.map((s) => s.day));
  let n = 0; const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1); // streak still alive if you trained yesterday
  while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

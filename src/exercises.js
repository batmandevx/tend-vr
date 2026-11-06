// Therapy exercises. Each one measures a movement against the user's *own* calibrated range,
// and quietly lowers its goal if the user is genuinely trying but can't reach it today ("never fail").
import * as THREE from 'three';
import { BED } from './garden.js';
import { TIPS } from './hands.js';

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lerp = THREE.MathUtils.lerp;

export function norms(calib) {
  const gr = Math.max(0.08, calib.fist - calib.open);
  const sr = Math.max(0.12, calib.maxSpread - calib.restSpread);
  return {
    grip: (f) => clamp01((f.grip - calib.open) / gr),
    spread: (f) => clamp01((f.spread - calib.restSpread) / sr),
    turn: (f) => clamp01((f.palmUp + 1) / 2),
  };
}

export const EXERCISES = {
  bloom: {
    title: 'Bloom', variant: 0, color: '#ff8fab',
    goal: 'Grip strength & finger flexion',
    intro: 'Slowly close your hand into a gentle fist, then open it wide. The flower opens with you.',
    cues: ['Close gently…', 'Now open wide…'],
    reps: { quick: 5, full: 8 },
  },
  pinch: {
    title: 'Seed Pinch', variant: 1, color: '#9bd0ff',
    goal: 'Fine motor control & thumb opposition',
    intro: 'Touch your thumb to the glowing fingertip. Each touch plants a seedlight.',
    reps: { quick: 4, full: 8 },
  },
  spread: {
    title: 'Fan the Ferns', variant: 2, color: '#7bc77e',
    goal: 'Finger abduction & dexterity',
    intro: 'Keep your hand open and spread your fingers apart like a fan, then relax them together.',
    cues: ['Spread your fingers…', 'And relax…'],
    reps: { quick: 0, full: 6 },
  },
  turn: {
    title: 'Turn to the Sun', variant: 3, color: '#ffc94d',
    goal: 'Forearm rotation (supination)',
    intro: 'Rest your elbow. Turn your palm up to face the sun, then back down.',
    cues: ['Turn your palm up…', 'And back down…'],
    reps: { quick: 4, full: 6 },
  },
  fireflies: {
    title: 'Fireflies', variant: 4, color: '#fff3a8',
    goal: 'Reach, coordination & hand-eye control',
    intro: 'Reach out and touch each firefly with any finger. Take your time.',
    reps: { quick: 5, full: 8 },
  },
};
export const ORDER = ['bloom', 'pinch', 'spread', 'turn', 'fireflies'];

// Generic "go to target, then return to rest" cycle.
class CycleRunner {
  constructor(def, metricFn, target, rest, reps) {
    Object.assign(this, { def, metricFn, target, rest, reps });
    this.count = 0; this.phase = 'go'; this.value = 0; this.best = 0; this.attemptBest = 0;
    this.phaseTime = 0; this.repStart = 0; this.repTimes = []; this.adapted = 0; this.t = 0; this.peakRaw = 0;
  }
  update(f, dt) {
    const ev = [];
    this.t += dt; this.phaseTime += dt;
    const x = this.metricFn(f);
    this.value += (x - this.value) * Math.min(1, dt * 12);
    this.best = Math.max(this.best, this.value);
    if (this.phase === 'go') {
      this.attemptBest = Math.max(this.attemptBest, this.value);
      if (this.value >= this.target) { this.phase = 'back'; this.phaseTime = 0; ev.push('peak'); }
      else if (this.phaseTime > 7 && this.attemptBest > this.rest + 0.08 && this.attemptBest >= this.target * 0.55) {
        // trying hard but not reaching: meet them where they are
        this.target = Math.max(this.rest + 0.12, this.attemptBest * 0.95);
        this.adapted++; this.phaseTime = 0; ev.push('adapt');
      }
    } else if (this.value <= this.rest) {
      this.count++; this.repTimes.push(this.t - this.repStart); this.repStart = this.t;
      this.phase = 'go'; this.phaseTime = 0; this.attemptBest = 0; ev.push('rep');
    }
    return ev;
  }
  get done() { return this.count >= this.reps; }
  get progress() { return this.phase === 'go' ? this.value / this.target : 1 - (this.value - this.rest) / Math.max(0.01, this.target - this.rest) * 0.5; }
}

export function createRunner(id, ctx) {
  const def = EXERCISES[id];
  const level = ctx.profile.level[id];
  const reps = def.reps[ctx.profile.length] || def.reps.full;
  const N = norms(ctx.profile.calib);

  if (id === 'bloom') {
    const r = new CycleRunner(def, N.grip, lerp(0.45, 0.95, level), 0.22, reps);
    r.visual = (g) => g.setHero({ open: 1 - r.value, fan: 0.5, face: 0, hue: 0.95 });
    r.raw = (f) => f.grip;
    return r;
  }
  if (id === 'spread') {
    const r = new CycleRunner(def, N.spread, lerp(0.4, 0.95, level), 0.25, reps);
    r.visual = (g) => g.setHero({ open: 1, fan: r.value, face: 0, hue: 0.33 });
    r.raw = (f) => f.spread * 180 / Math.PI;
    return r;
  }
  if (id === 'turn') {
    const r = new CycleRunner(def, N.turn, lerp(0.55, 0.95, level), 0.3, reps);
    r.visual = (g) => g.setHero({ open: 0.85, fan: 0.5, face: r.value, hue: 0.13 });
    r.raw = (f) => Math.acos(THREE.MathUtils.clamp(-f.palmUp, -1, 1)) * 180 / Math.PI;
    return r;
  }
  if (id === 'pinch') return new PinchRunner(def, level, reps);
  if (id === 'fireflies') return new FireflyRunner(def, level, reps, ctx);
}

class PinchRunner {
  constructor(def, level, reps) {
    this.def = def; this.reps = reps; this.count = 0;
    this.thresh = lerp(0.45, 0.26, level);
    this.finger = 0; this.armed = true; this.value = 0; this.t = 0; this.stuck = 0; this.repStart = 0;
    this.repTimes = []; this.adapted = 0; this.best = 0;
  }
  get done() { return this.count >= this.reps; }
  get progress() { return this.value; }
  get highlight() { return [TIPS.thumb, [TIPS.index, TIPS.middle, TIPS.ring, TIPS.pinky][this.finger]]; }
  update(f, dt) {
    const ev = []; this.t += dt; this.stuck += dt;
    const d = f.pinch[this.finger];
    this.value = clamp01(1 - (d - this.thresh) / 0.6);
    if (this.armed && d < this.thresh) {
      this.count++; this.armed = false; this.repTimes.push(this.t - this.repStart); this.repStart = this.t; this.stuck = 0;
      this.best = Math.max(this.best, 1);
      this.finger = (this.finger + 1) % 4; ev.push('rep');
    } else if (!this.armed && Math.min(...f.pinch) > this.thresh + 0.18) this.armed = true;
    if (this.armed && this.stuck > 8 && this.thresh < 0.65) { this.thresh += 0.06; this.stuck = 0; this.adapted++; ev.push('adapt'); }
    return ev;
  }
  visual(g) { g.setHero({ open: 0.8, fan: 0.5, face: 0, hue: 0.58 }); }
  raw() { return 0; }
}

class FireflyRunner {
  constructor(def, level, reps, ctx) {
    this.def = def; this.reps = reps; this.count = 0; this.t = 0; this.repStart = 0; this.repTimes = []; this.adapted = 0; this.best = 0; this.value = 0;
    this.reach = lerp(0.1, 0.26, level);
    this.world = ctx.world; this.side = ctx.side; // -1 left, 1 right, 0 both
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.014, 16, 12), new THREE.MeshBasicMaterial({ color: '#fff7b0', toneMapped: false }));
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.25, depthWrite: false, toneMapped: false }));
    g.add(core, halo); this.halo = halo; this.fly = g;
    ctx.world.add(g);
    this.home = new THREE.Vector3(this.side * 0.12, BED.y + 0.3, BED.z + 0.12);
    this.base = new THREE.Vector3(); this.wp = new THREE.Vector3(); this.stuck = 0;
    this._spawn();
  }
  _spawn() {
    const a = Math.random() * Math.PI * 2, el = (Math.random() - 0.3) * 0.9;
    const r = this.reach * (0.6 + Math.random() * 0.4);
    this.base.set(this.home.x + Math.cos(a) * r * 0.9, this.home.y + Math.sin(el) * r * 0.6, this.home.z + Math.sin(a) * r * 0.5);
    this.fly.position.copy(this.base); this.stuck = 0; this.spawnT = this.t;
  }
  get done() { return this.count >= this.reps; }
  get progress() { return this.value; }
  update(f, dt, hand) {
    const ev = []; this.t += dt; this.stuck += dt;
    this.fly.position.set(this.base.x + Math.sin(this.t * 1.7) * 0.012, this.base.y + Math.sin(this.t * 2.3) * 0.01, this.base.z + Math.cos(this.t * 1.3) * 0.01);
    this.halo.scale.setScalar(1 + Math.sin(this.t * 6) * 0.15);
    this.fly.getWorldPosition(this.wp);
    let dmin = 9;
    if (hand && hand.visible) for (const i of [4, 9, 14, 19, 24]) dmin = Math.min(dmin, hand.joints[i].distanceTo(this.wp));
    if (f.valid) dmin = Math.min(dmin, f.palmCenter.distanceTo(this.wp));
    this.value = clamp01(1 - (dmin - 0.05) / 0.3);
    if (dmin < 0.055) {
      this.count++; this.repTimes.push(this.t - this.repStart); this.repStart = this.t; this.best = 1;
      ev.push('rep');
      this.caughtAt = this.wp.clone();
      if (!this.done) this._spawn(); else this.fly.visible = false;
    } else if (this.stuck > 9) { // too far today: bring it closer
      this.reach = Math.max(0.06, this.reach * 0.75); this.home.lerp(new THREE.Vector3(this.side * 0.1, BED.y + 0.28, BED.z + 0.15), 0.5);
      this.adapted++; ev.push('adapt'); this._spawn();
    }
    return ev;
  }
  visual(g) { g.setHero({ open: 0.9, fan: 0.6, face: 0.3, hue: 0.14 }); }
  raw() { return 0; }
  dispose() { this.world.remove(this.fly); }
}

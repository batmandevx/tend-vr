// Desktop hand simulator (keyboard + mouse) and an autopilot that plays through the whole app.
// The simulated hand produces the same 25-joint data as WebXR, so every gesture path is exercised.
import * as THREE from 'three';
import { buildSimHand, defaultSimParams, TIPS } from './hands.js';
import { BED } from './garden.js';

const POSE = {
  relaxed: { curl: [0.15, 0.18, 0.2, 0.22], thumbCurl: 0, spread: 0.08 },
  open: { curl: [0, 0, 0, 0], thumbCurl: 0, spread: 0.1 },
  point: { curl: [0, 0.95, 0.95, 0.95], thumbCurl: 0.75, spread: 0.05 },
  fist: { curl: [1, 1, 1, 1], thumbCurl: 1, spread: 0.0 },
  spread: { curl: [0, 0, 0, 0], thumbCurl: 0, spread: 0.42 },
};

export class SimHands {
  constructor(app) {
    this.app = app;
    this.side = 'right';
    this.p = defaultSimParams();
    this.t = defaultSimParams();
    this.keys = new Set();
    this.mouse = new THREE.Vector2(0.15, -0.35);
    this.depth = 0; this.push = 0;
    this.autopilot = null;
    this._tip = new THREE.Vector3();
    this.manualTip = new THREE.Vector3(0.1, 0.75, -0.4);
    const el = app.renderer.domElement;
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.key.toLowerCase());
      if (e.key.toLowerCase() === 'h') this.side = this.side === 'right' ? 'left' : 'right';
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    el.addEventListener('pointermove', (e) => { const r = el.getBoundingClientRect(); this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); });
    el.addEventListener('wheel', (e) => { this.depth = THREE.MathUtils.clamp(this.depth + e.deltaY * -0.0004, -0.15, 0.2); }, { passive: true });
  }

  setPose(name, extra = {}) {
    const P = POSE[name];
    this.t.curl = [...P.curl]; this.t.thumbCurl = P.thumbCurl; this.t.spread = P.spread;
    this.t.pinchFinger = -1; this.t.pinch = 0; this.t.roll = 0;
    Object.assign(this.t, extra);
  }

  // Move so the index fingertip goes to `tip` (world coords).
  aimTip(tip, speed, dt) {
    const hand = this.app.sim[this.side];
    const off = this._tip.subVectors(hand.joints[TIPS.index], hand.joints[0]);
    const goal = tip.clone().sub(off);
    const d = goal.distanceTo(this.p.pos);
    const step = Math.min(d, speed * dt);
    if (d > 1e-5) this.p.pos.addScaledVector(goal.sub(this.p.pos).normalize(), step);
    return d;
  }

  manual(dt) {
    const k = this.keys;
    // mouse -> point on a plane in front of the user
    const cam = this.app.camera, ray = new THREE.Raycaster();
    ray.setFromCamera(this.mouse, cam);
    const planeZ = this.app.world.localToWorld(new THREE.Vector3(0, 0, -0.38 - this.depth - (k.has(' ') ? 0.12 : 0)));
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1).applyQuaternion(this.app.world.quaternion), 0);
    plane.constant = -plane.normal.dot(planeZ);
    const hit = new THREE.Vector3();
    if (ray.ray.intersectPlane(plane, hit)) this.manualTip.copy(hit);
    let pose = 'point';
    if (k.has('f')) pose = 'fist'; else if (k.has('g')) pose = 'spread'; else if (k.has('o')) pose = 'open';
    this.setPose(pose);
    for (let i = 1; i <= 4; i++) if (k.has(String(i))) { this.setPose('relaxed', { pinchFinger: i - 1, pinch: 1 }); }
    if (k.has('t')) { this.setPose('open', { roll: Math.PI * 0.95 }); }
    this.aimTip(this.manualTip, 3, dt);
  }

  update(dt) {
    if (this.autopilot) this.autopilot.update(dt); else this.manual(dt);
    // smooth toward targets
    const a = Math.min(1, dt * 7), p = this.p, t = this.t;
    for (let i = 0; i < 4; i++) p.curl[i] += (t.curl[i] - p.curl[i]) * a;
    p.thumbCurl += (t.thumbCurl - p.thumbCurl) * a;
    p.spread += (t.spread - p.spread) * a;
    p.roll += (t.roll - p.roll) * Math.min(1, dt * 4);
    if (t.pinchFinger !== p.pinchFinger) { p.pinch += (0 - p.pinch) * a * 1.6; if (p.pinch < 0.05) p.pinchFinger = t.pinchFinger; }
    else p.pinch += (t.pinch - p.pinch) * a;
    p.yaw = this.side === 'right' ? -0.15 : 0.15;
    const sim = this.app.sim;
    buildSimHand(sim[this.side], p);
    sim[this.side === 'right' ? 'left' : 'right'].visible = false;
  }
}

// Plays through the app like a patient would — used for the demo video and as an end-to-end test.
export class Autopilot {
  constructor(sim, app) {
    this.sim = sim; this.app = app;
    this.mode = 'idle'; this.timer = 0; this.target = null; this.wait = 0;
    this.choices = {};
  }
  handHome() {
    const s = this.sim.side === 'right' ? 1 : -1;
    return this.app.world.localToWorld(new THREE.Vector3(s * 0.1, BED.y + 0.2, BED.z + 0.2));
  }
  update(dt) {
    const app = this.app, sim = this.sim;
    this.timer += dt;
    if (this.wait > 0) { this.wait -= dt; sim.aimTip(this.handHome(), 0.6, dt); return; }
    const btn = app.autopilotButton?.();
    if (btn) return this.poke(btn, dt);
    this.pressing = null;
    const st = app.state;
    if (st === 'calib') {
      const step = app.calibStep;
      sim.setPose(step === 0 ? 'open' : step === 1 ? 'spread' : 'fist');
      sim.aimTip(this.handHome(), 0.8, dt);
      return;
    }
    if (st === 'exercise' && app.runner) {
      const r = app.runner, id = app.exId;
      const home = this.handHome();
      // hold each position briefly, like a real person would
      if (r.phase !== this.lastPhase) { this.lastPhase = r.phase; this.holdT = 0.7; }
      this.holdT -= dt;
      const ph = this.holdT > 0 ? (r.phase === 'go' ? 'back' : 'go') : r.phase;
      if (id === 'bloom') sim.setPose(ph === 'go' ? 'fist' : 'open');
      else if (id === 'spread') sim.setPose(ph === 'go' ? 'spread' : 'open');
      else if (id === 'turn') sim.setPose('open', { roll: ph === 'go' ? Math.PI * 0.92 : 0 });
      else if (id === 'pinch') {
        if (this.lastCount !== r.count) { this.lastCount = r.count; this.release = 0.9; }
        this.release -= dt;
        sim.setPose('relaxed', this.release > 0 ? {} : { pinchFinger: r.finger, pinch: 1 });
      } else if (id === 'fireflies') {
        sim.setPose('point');
        const wp = r.fly.getWorldPosition(new THREE.Vector3());
        sim.aimTip(wp, 0.22, dt);
        return;
      }
      sim.aimTip(home, 0.6, dt);
      return;
    }
    sim.setPose('relaxed');
    sim.aimTip(this.handHome(), 0.6, dt);
  }
  poke(btn, dt) {
    const { panel, id } = btn;
    const sim = this.sim;
    sim.setPose('point');
    const b = panel.buttons.find((x) => x.id === id);
    if (!b) return;
    const W = panel.LW, H = panel.LH;
    const local = new THREE.Vector3(((b.x + b.w / 2) / W - 0.5) * panel.w, (0.5 - (b.y + b.h / 2) / H) * panel.h, 0);
    const front = panel.mesh.localToWorld(local.clone().setZ(0.06));
    const through = panel.mesh.localToWorld(local.clone().setZ(-0.02));
    if (this.pressing !== panel.mesh.id + id) { this.pressing = panel.mesh.id + id; this.phase = 0; this.hold = 0; }
    if (this.phase === 0) { if (sim.aimTip(front, 0.55, dt) < 0.004) { this.hold += dt; if (this.hold > 0.35) this.phase = 1; } }
    else if (sim.aimTip(through, 0.3, dt) < 0.003) { this.phase = 0; this.hold = 0; this.wait = 0.5; }
  }
}

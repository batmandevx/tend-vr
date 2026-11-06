// Hand data model shared by real WebXR hand tracking and the desktop simulator.
// Joint order follows the WebXR Hand Input spec (25 joints).
import * as THREE from 'three';

export const JOINTS = [
  'wrist',
  'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
  'index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip',
  'middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip',
  'ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip',
  'pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip',
];

// Bone connections for rendering.
export const BONES = [];
for (const chain of [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8, 9], [0, 10, 11, 12, 13, 14], [0, 15, 16, 17, 18, 19], [0, 20, 21, 22, 23, 24]]) {
  for (let i = 0; i < chain.length - 1; i++) BONES.push([chain[i], chain[i + 1]]);
}
BONES.push([6, 11], [11, 16], [16, 21]); // knuckle line, makes the palm read as a palm

export const TIPS = { thumb: 4, index: 9, middle: 14, ring: 19, pinky: 24 };
export const FINGER_BASES = [5, 10, 15, 20]; // index..pinky metacarpal joint index

export class HandState {
  constructor(handedness) {
    this.handedness = handedness; // 'left' | 'right'
    this.joints = JOINTS.map(() => new THREE.Vector3());
    this.radii = new Float32Array(25).fill(0.008);
    this.visible = false;
    this.lastSeen = 0;
    this.simulated = false;
  }
  copyFrom(o) {
    for (let i = 0; i < 25; i++) { this.joints[i].copy(o.joints[i]); this.radii[i] = o.radii[i]; }
    this.visible = o.visible;
  }
}

// ---------- WebXR reading ----------
export function readXRHands(frame, refSpace, hands, now) {
  const session = frame.session;
  hands.left.visible = false;
  hands.right.visible = false;
  for (const src of session.inputSources) {
    if (!src.hand) continue;
    const h = src.handedness === 'left' ? hands.left : hands.right;
    let ok = true;
    for (let i = 0; i < 25; i++) {
      const space = src.hand.get(JOINTS[i]);
      const pose = space && frame.getJointPose(space, refSpace);
      if (!pose) { ok = false; break; }
      const p = pose.transform.position;
      h.joints[i].set(p.x, p.y, p.z);
      h.radii[i] = pose.radius || 0.008;
    }
    h.visible = ok;
    h.simulated = false;
    if (ok) h.lastSeen = now;
  }
}

// ---------- Procedural simulated hand ----------
// Right-hand layout in hand-local space: wrist at origin, fingers toward -Z,
// palm facing -Y (palm down), thumb toward -X.
const FINGER_DEF = [
  { mc: [-0.012, 0, -0.012], kn: [-0.024, 0.002, -0.082], len: [0.040, 0.024, 0.020], splay: -1.0 },
  { mc: [0.000, 0, -0.014], kn: [-0.003, 0.003, -0.088], len: [0.045, 0.028, 0.022], splay: 0.0 },
  { mc: [0.012, 0, -0.012], kn: [0.017, 0.002, -0.081], len: [0.042, 0.026, 0.021], splay: 0.7 },
  { mc: [0.022, -0.002, -0.010], kn: [0.034, 0.000, -0.070], len: [0.031, 0.020, 0.019], splay: 1.35 },
];
const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _ax = new THREE.Vector3(), _n = new THREE.Vector3(0, -1, 0);
const _q = new THREE.Quaternion();

export function defaultSimParams() {
  return {
    pos: new THREE.Vector3(0.12, 1.0, -0.4),
    yaw: 0, pitch: -0.25,
    curl: [0, 0, 0, 0], thumbCurl: 0,
    spread: 0.08, // radians of extra abduction per unit splay
    roll: 0, // 0 = palm down, PI = palm up (supination)
    pinchFinger: -1, pinch: 0,
  };
}

const local = JOINTS.map(() => new THREE.Vector3());
export function buildSimHand(hand, p) {
  const mirror = hand.handedness === 'left' ? -1 : 1;
  local[0].set(0, 0, 0);
  // fingers
  const tips = [];
  for (let f = 0; f < 4; f++) {
    const d = FINGER_DEF[f], b = FINGER_BASES[f];
    local[b].fromArray(d.mc);
    local[b + 1].fromArray(d.kn);
    _d.subVectors(local[b + 1], local[b]).normalize();
    _d.applyAxisAngle(_ax.set(0, 1, 0), -d.splay * p.spread); // abduct in palm plane
    let c = p.curl[f];
    if (p.pinchFinger === f) c = Math.max(c, 0.42 * p.pinch);
    const flex = [c * 1.45, c * 1.65, c * 1.05];
    let prev = local[b + 1];
    for (let s = 0; s < 3; s++) {
      _ax.crossVectors(_d, _n).normalize();
      _d.applyAxisAngle(_ax, flex[s]);
      local[b + 2 + s].copy(prev).addScaledVector(_d, d.len[s]);
      prev = local[b + 2 + s];
    }
    tips.push(local[b + 4]);
  }
  // thumb
  local[1].set(-0.018, -0.008, -0.018);
  local[2].set(-0.040, -0.016, -0.042);
  local[3].set(-0.052, -0.020, -0.072);
  local[4].set(-0.058, -0.022, -0.096);
  const tc = p.thumbCurl;
  if (tc > 0) { // fold across palm
    const target = _v.set(-0.005, -0.032, -0.070);
    local[3].lerp(_v.clone().set(-0.030, -0.030, -0.066), tc * 0.8);
    local[4].lerp(target, tc);
  }
  if (p.pinchFinger >= 0 && p.pinch > 0) {
    const tip = tips[p.pinchFinger];
    const goal = tip.clone().add(_v.set(-0.004, -0.009, 0.004));
    local[4].lerp(goal, p.pinch);
    const mid = local[2].clone().lerp(goal, 0.55).add(_v.set(-0.006, -0.006, 0));
    local[3].lerp(mid, p.pinch);
  }
  // orient: roll about forearm (Z), then pitch, yaw; mirror for left hand.
  _q.setFromEuler(new THREE.Euler(p.pitch, p.yaw, mirror * -p.roll, 'YXZ'));
  for (let i = 0; i < 25; i++) {
    _v.copy(local[i]);
    _v.x *= mirror;
    _v.applyQuaternion(_q).add(p.pos);
    hand.joints[i].copy(_v);
    hand.radii[i] = i === 0 ? 0.018 : (i % 5 === 4 || i === 4) ? 0.0075 : 0.0095;
  }
  hand.visible = true;
  hand.simulated = true;
}

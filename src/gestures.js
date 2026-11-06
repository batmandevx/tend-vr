// Turns raw joint positions into therapy-relevant measurements.
// Everything is scale-normalised by the user's own hand size so it works for any hand.
import * as THREE from 'three';
import { FINGER_BASES, TIPS } from './hands.js';

const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
const s1 = new THREE.Vector3(), s2 = new THREE.Vector3();

function chainCurl(j, base) {
  // Sum of bend angles along metacarpal -> proximal -> intermediate -> distal -> tip.
  let sum = 0;
  for (let k = 0; k < 3; k++) {
    s1.subVectors(j[base + k + 1], j[base + k]).normalize();
    s2.subVectors(j[base + k + 2], j[base + k + 1]).normalize();
    sum += Math.acos(THREE.MathUtils.clamp(s1.dot(s2), -1, 1));
  }
  return THREE.MathUtils.clamp(sum / 4.0, 0, 1);
}

export function createFeatures() {
  return {
    valid: false, handSize: 0.09,
    curls: [0, 0, 0, 0], grip: 0, spread: 0,
    pinch: [1, 1, 1, 1], // thumb-tip to fingertip distance / hand size
    palmUp: -1, normal: new THREE.Vector3(),
    palmCenter: new THREE.Vector3(), indexTip: new THREE.Vector3(), pinchPoint: new THREE.Vector3(),
  };
}

export function analyzeHand(hand, f) {
  f.valid = hand.visible;
  if (!hand.visible) return f;
  const j = hand.joints;
  f.handSize = Math.max(0.05, j[0].distanceTo(j[11]));
  let g = 0;
  for (let i = 0; i < 4; i++) { f.curls[i] = chainCurl(j, FINGER_BASES[i]); g += f.curls[i]; }
  f.grip = g / 4;

  // palm normal (points out of the palm)
  a.subVectors(j[6], j[0]);
  b.subVectors(j[21], j[0]);
  f.normal.crossVectors(a, b).normalize();
  if (hand.handedness === 'left') f.normal.negate();
  f.palmUp = f.normal.y;

  // spread: angle between index and pinky proximal phalanges, projected on palm plane
  a.subVectors(j[7], j[6]); a.addScaledVector(f.normal, -a.dot(f.normal)).normalize();
  b.subVectors(j[22], j[21]); b.addScaledVector(f.normal, -b.dot(f.normal)).normalize();
  f.spread = Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1));

  const tt = j[TIPS.thumb];
  const tipIdx = [TIPS.index, TIPS.middle, TIPS.ring, TIPS.pinky];
  for (let i = 0; i < 4; i++) f.pinch[i] = tt.distanceTo(j[tipIdx[i]]) / f.handSize;

  f.palmCenter.copy(j[0]).add(j[11]).multiplyScalar(0.5).addScaledVector(f.normal, 0.01);
  f.indexTip.copy(j[TIPS.index]);
  f.pinchPoint.copy(tt).add(j[TIPS.index]).multiplyScalar(0.5);
  return f;
}

// Mirror a hand across a vertical plane (for mirror therapy).
export function mirrorHand(src, dst, planePoint, planeNormal) {
  for (let i = 0; i < 25; i++) {
    c.subVectors(src.joints[i], planePoint);
    const d = c.dot(planeNormal);
    dst.joints[i].copy(src.joints[i]).addScaledVector(planeNormal, -2 * d);
    dst.radii[i] = src.radii[i];
  }
  dst.visible = src.visible;
}

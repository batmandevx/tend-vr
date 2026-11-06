// Stylised, high-contrast hand rendering (joints + bones), used for real, simulated and mirrored hands.
import * as THREE from 'three';
import { BONES } from './hands.js';

const UP = new THREE.Vector3(0, 1, 0);
const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), mid = new THREE.Vector3(), dir = new THREE.Vector3();

export class HandView {
  constructor(scene, color, emissive, opacity = 1) {
    const mat = new THREE.MeshStandardMaterial({
      color, emissive, emissiveIntensity: 0.55, roughness: 0.45, metalness: 0.0,
      transparent: opacity < 1, opacity,
    });
    this.joints = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), mat, 25);
    this.bones = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 10, 1), mat, BONES.length);
    for (const im of [this.joints, this.bones]) { im.frustumCulled = false; im.visible = false; scene.add(im); }
    this.material = mat;
  }
  setVisible(v) { this.joints.visible = this.bones.visible = v; }
  update(hand) {
    if (!hand.visible) { this.setVisible(false); return; }
    this.setVisible(true);
    for (let i = 0; i < 25; i++) {
      const r = hand.radii[i] * (i === 0 ? 0.9 : 1.05);
      m.compose(hand.joints[i], q.identity(), s.set(r, r, r));
      this.joints.setMatrixAt(i, m);
    }
    BONES.forEach(([a, b], i) => {
      const pa = hand.joints[a], pb = hand.joints[b];
      dir.subVectors(pb, pa);
      const len = dir.length();
      mid.addVectors(pa, pb).multiplyScalar(0.5);
      q.setFromUnitVectors(UP, dir.normalize());
      const r = Math.min(hand.radii[a], hand.radii[b]) * 0.62;
      m.compose(mid, q, s.set(r, len, r));
      this.bones.setMatrixAt(i, m);
    });
    this.joints.instanceMatrix.needsUpdate = true;
    this.bones.instanceMatrix.needsUpdate = true;
  }
}

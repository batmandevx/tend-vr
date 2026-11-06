// Stylised, high-contrast hand rendering (joints + bones), used for real, simulated and mirrored hands.
import * as THREE from 'three';
import { BONES } from './hands.js';

const UP = new THREE.Vector3(0, 1, 0);
const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), mid = new THREE.Vector3(), dir = new THREE.Vector3();

export class HandView {
  constructor(scene, color, emissive, opacity = 1) {
    // Luminous "spirit hand": soft core with a bright fresnel rim, readable against any background.
    const mat = new THREE.ShaderMaterial({
      uniforms: { core: { value: new THREE.Color(color) }, rim: { value: new THREE.Color(emissive) }, opacity: { value: opacity } },
      vertexShader: `varying vec3 vN; varying vec3 vV;
        void main(){
          vec4 p = instanceMatrix * vec4(position, 1.0);
          vec4 mv = modelViewMatrix * p; vV = -mv.xyz;
          vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 core; uniform vec3 rim; uniform float opacity; varying vec3 vN; varying vec3 vV;
        void main(){
          float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
          vec3 c = mix(core, rim * 1.6, f);
          gl_FragColor = vec4(c, opacity * mix(0.78, 1.0, f));
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: true,
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

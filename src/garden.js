// The persistent garden: environment, planter bed, instanced plants, the live "heart bloom", sparkles.
import * as THREE from 'three';

export const BED = { y: -0.5, z: -0.48, r: 0.4 };
const easeOutBack = (t) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

let _dot;
export function dotTexture() {
  if (_dot) return _dot;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return (_dot = new THREE.CanvasTexture(c));
}

function seeded(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

// Plant variants, one per exercise.
export const VARIANTS = [
  { name: 'Tulip', petals: 6, petalLen: 0.034, petalW: 0.016, tilt: 1.05, stem: 0.11, center: 0.008, sat: 0.75, light: 0.62 },     // bloom
  { name: 'Seedlight', petals: 5, petalLen: 0.018, petalW: 0.012, tilt: 0.5, stem: 0.06, center: 0.012, glow: true, sat: 0.6, light: 0.75 }, // pinch
  { name: 'Fern', petals: 7, petalLen: 0.06, petalW: 0.008, tilt: 0.75, stem: 0.03, center: 0.0, green: true },                      // spread
  { name: 'Sunflower', petals: 12, petalLen: 0.03, petalW: 0.009, tilt: 0.25, stem: 0.15, center: 0.016, hueFix: 0.12, sat: 0.95, light: 0.55 }, // turn
  { name: 'Lantern', petals: 0, petalLen: 0, petalW: 0, tilt: 0, stem: 0.09, center: 0.013, glow: true, hueFix: 0.14, sat: 0.9, light: 0.7 }, // fireflies
];

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();

export class Garden {
  constructor(world, opts = {}) {
    this.world = world;
    this.env = new THREE.Group();
    this.bedGroup = new THREE.Group();
    world.add(this.env, this.bedGroup);
    this.time = 0;
    this.plants = [];
    this.growing = new Set();
    this.floorY = -1.15;
    this._buildEnv();
    this._buildBed();
    this._buildPools();
    this._buildHero();
    this.sparkles = new Sparkles(world);
  }

  setFloorY(y) { this.floorY = y; this.env.position.y = y + 1.15; this._placeBedLegs(); this._repositionMeadow(); }

  _buildEnv() {
    const env = this.env;
    // Sky dome
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { top: { value: new THREE.Color('#7fb3e6') }, mid: { value: new THREE.Color('#f7d9c4') }, bottom: { value: new THREE.Color('#d7e8c8') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
      fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP; void main(){ float h=vP.y; vec3 c = h>0.0 ? mix(mid, top, pow(h,0.6)) : mix(mid,bottom,min(1.0,-h*4.0)); gl_FragColor=vec4(c,1.0);} ',
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), skyMat);
    env.add(this.sky);
    // Sun
    this.sun = new THREE.Mesh(new THREE.SphereGeometry(2.2, 24, 12), new THREE.MeshBasicMaterial({ color: '#fff1c9', fog: false }));
    this.sun.position.set(-12, 9, -40);
    env.add(this.sun);

    // Ground
    const groundGeo = new THREE.CircleGeometry(40, 64);
    groundGeo.rotateX(-Math.PI / 2);
    const colors = [];
    const pos = groundGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const d = Math.hypot(pos.getX(i), pos.getZ(i));
      col.setHSL(0.27 + seeded(i) * 0.04, 0.42, 0.42 + seeded(i + 9) * 0.06 - Math.min(d / 200, 0.08));
      colors.push(col.r, col.g, col.b);
    }
    groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    this.ground.position.y = -1.15;
    env.add(this.ground);

    // Pond
    const pond = new THREE.Mesh(new THREE.CircleGeometry(2.4, 40), new THREE.MeshStandardMaterial({ color: '#6fa8c9', roughness: 0.15, metalness: 0.1 }));
    pond.rotation.x = -Math.PI / 2; pond.position.set(3.2, -1.14, -4.5); pond.scale.set(1.4, 1, 1);
    env.add(pond);

    // Hills
    const hillMat = new THREE.MeshStandardMaterial({ color: '#8fb07a', roughness: 1, flatShading: true });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3;
      const h = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), hillMat);
      h.scale.set(9 + seeded(i) * 6, 2.5 + seeded(i + 3) * 3, 7 + seeded(i + 5) * 4);
      h.position.set(Math.cos(a) * 34, -1.6, Math.sin(a) * 34);
      env.add(h);
    }
    // Trees (merged into instanced trunks + crowns)
    const trunkGeo = new THREE.CylinderGeometry(0.08, 0.12, 1, 6); trunkGeo.translate(0, 0.5, 0);
    const crownGeo = new THREE.IcosahedronGeometry(1, 0);
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: '#7a5a3f', roughness: 1 }), 40);
    const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true }), 40);
    let n = 0;
    for (let k = 0; k < 80 && n < 40; k++) {
      const i = n++;
      const a = seeded(k * 3) * Math.PI * 2, r = 7 + seeded(k * 7) * 16;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const hgt = 1.4 + seeded(i) * 1.8;
      m4.compose(v.set(x, -1.15, z), q.identity(), sc.set(1, hgt, 1)); trunks.setMatrixAt(i, m4);
      const cr = 0.8 + seeded(i + 1) * 0.7;
      m4.compose(v.set(x, -1.15 + hgt + cr * 0.6, z), q.setFromEuler(e.set(0, seeded(i) * 6, 0)), sc.set(cr, cr * 1.2, cr)); crowns.setMatrixAt(i, m4);
      crowns.setColorAt(i, col.setHSL(0.26 + seeded(i + 2) * 0.1, 0.45, 0.38 + seeded(i + 4) * 0.12));
    }
    trunks.count = crowns.count = n;
    env.add(trunks, crowns);

    // Floating pollen
    const N = 220, pp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pp[i * 3] = (seeded(i) - 0.5) * 6; pp[i * 3 + 1] = seeded(i + 50) * 2.2 - 0.9; pp[i * 3 + 2] = (seeded(i + 99) - 0.5) * 6; }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    this.pollen = new THREE.Points(pg, new THREE.PointsMaterial({ map: dotTexture(), color: '#fff6d8', size: 0.02, transparent: true, opacity: 0.8, depthWrite: false }));
    env.add(this.pollen);
  }

  _buildBed() {
    const g = this.bedGroup;
    const wood = new THREE.MeshStandardMaterial({ color: '#a3734c', roughness: 0.85 });
    this.rim = new THREE.Mesh(new THREE.TorusGeometry(BED.r + 0.02, 0.025, 10, 48), wood);
    this.rim.rotation.x = -Math.PI / 2; this.rim.position.set(0, BED.y, BED.z);
    this.soil = new THREE.Mesh(new THREE.CylinderGeometry(BED.r, BED.r, 0.03, 48), new THREE.MeshStandardMaterial({ color: '#5a3d2b', roughness: 1 }));
    this.soil.position.set(0, BED.y - 0.012, BED.z);
    this.base = new THREE.Mesh(new THREE.CylinderGeometry(BED.r + 0.03, BED.r - 0.05, 1, 40, 1, true), wood);
    g.add(this.rim, this.soil, this.base);
    this._placeBedLegs();
  }
  _placeBedLegs() {
    const h = Math.max(0.05, (BED.y - 0.03) - this.floorY);
    this.base.scale.set(1, h, 1);
    this.base.position.set(0, BED.y - 0.03 - h / 2, BED.z);
  }

  _buildPools() {
    const petalGeo = new THREE.SphereGeometry(1, 10, 6); petalGeo.translate(0, 0, 1);
    const stemGeo = new THREE.CylinderGeometry(1, 1.3, 1, 6); stemGeo.translate(0, 0.5, 0);
    const ballGeo = new THREE.SphereGeometry(1, 12, 8);
    const mk = (geo, mat, n) => { const im = new THREE.InstancedMesh(geo, mat, n); im.count = 0; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.bedGroup.add(im); return im; };
    this.pool = {
      petal: mk(petalGeo, new THREE.MeshStandardMaterial({ roughness: 0.6 }), 6000),
      stem: mk(stemGeo, new THREE.MeshStandardMaterial({ color: '#4f8a3c', roughness: 0.9 }), 900),
      leaf: mk(petalGeo, new THREE.MeshStandardMaterial({ color: '#5fa24a', roughness: 0.8 }), 1800),
      center: mk(ballGeo, new THREE.MeshStandardMaterial({ roughness: 0.7 }), 900),
      glow: mk(ballGeo, new THREE.MeshBasicMaterial({ toneMapped: false }), 900),
    };
    // warm up instance colour buffers
    for (const k of ['petal', 'center', 'glow', 'leaf']) { this.pool[k].setColorAt(0, col.set('#fff')); }
  }

  _alloc(kind, n) {
    const im = this.pool[kind];
    if (im.count + n > im.instanceMatrix.count) return null;
    const start = im.count; im.count += n;
    return start;
  }

  // Deterministic placement: Vogel spiral in the bed, then a meadow around the user.
  slotPosition(n, out) {
    const BED_SLOTS = 150;
    const golden = 2.39996323;
    if (n < BED_SLOTS) {
      const r = Math.sqrt(0.095 * 0.095 + n * 0.00094);
      const a = n * golden;
      return { pos: out.set(Math.cos(a) * r, BED.y, BED.z + Math.sin(a) * r), scale: 1, meadow: false };
    }
    const k = n - BED_SLOTS;
    const r = 1.1 + Math.sqrt(k) * 0.16;
    const a = k * golden;
    return { pos: out.set(Math.cos(a) * r, this.floorY, Math.sin(a) * r - 0.2), scale: 2.4, meadow: true };
  }
  _repositionMeadow() {
    for (const p of this.plants) if (p.meadow) { p.pos.y = this.floorY; this._writePlant(p); }
  }

  addPlant(variant, hue, seed, animate = true) {
    const n = this.plants.length;
    const V = VARIANTS[variant];
    const slot = this.slotPosition(n, new THREE.Vector3());
    const p = {
      variant, hue, seed, pos: slot.pos, scale: slot.scale * (0.85 + seeded(seed) * 0.3), meadow: slot.meadow,
      growth: animate ? 0 : 1, yaw: seeded(seed + 1) * Math.PI * 2,
      stem: this._alloc('stem', 1), leaf: this._alloc('leaf', 2),
      petal: V.petals ? this._alloc('petal', V.petals) : null,
      center: V.center ? this._alloc(V.glow ? 'glow' : 'center', 1) : null,
    };
    if (p.stem === null) return null;
    // colours
    const hueFinal = V.hueFix ?? hue;
    if (p.petal !== null) for (let i = 0; i < V.petals; i++) {
      if (V.green) col.setHSL(0.28 + seeded(seed + i) * 0.06, 0.55, 0.38 + seeded(seed + i * 2) * 0.1);
      else col.setHSL(hueFinal + (seeded(seed + i) - 0.5) * 0.03, V.sat, V.light + (seeded(seed + i * 3) - 0.5) * 0.08);
      this.pool.petal.setColorAt(p.petal + i, col);
    }
    if (p.center !== null) {
      const im = V.glow ? this.pool.glow : this.pool.center;
      if (V.glow) col.setHSL(hueFinal, 0.9, 0.72); else if (variant === 3) col.set('#5b3a1e'); else col.setHSL(0.13, 0.9, 0.6);
      im.setColorAt(p.center, col);
      im.instanceColor.needsUpdate = true;
    }
    for (let i = 0; i < 2; i++) this.pool.leaf.setColorAt(p.leaf + i, col.setHSL(0.29, 0.5, 0.4 + seeded(seed + i) * 0.08));
    this.pool.petal.instanceColor && (this.pool.petal.instanceColor.needsUpdate = true);
    this.pool.leaf.instanceColor.needsUpdate = true;
    this.plants.push(p);
    this._writePlant(p);
    if (animate) this.growing.add(p);
    return p;
  }

  _writePlant(p) {
    const V = VARIANTS[p.variant];
    const g = easeOutBack(Math.min(1, p.growth));
    const S = p.scale * Math.max(0.0001, g);
    const sway = Math.sin(this.time * 1.3 + p.seed) * 0.04 * (p.growth >= 1 ? 1 : 0);
    // stem
    const h = V.stem * S;
    m4.compose(p.pos, q.setFromEuler(e.set(sway, 0, sway * 0.6)), sc.set(0.0035 * S, h, 0.0035 * S));
    this.pool.stem.setMatrixAt(p.stem, m4);
    const top = v.set(0, h, 0).applyQuaternion(q).add(p.pos).clone();
    // leaves
    for (let i = 0; i < 2; i++) {
      const lp = new THREE.Vector3(0, h * 0.35, 0).applyQuaternion(q).add(p.pos);
      m4.compose(lp, q.clone().setFromEuler(e.set(-0.5, p.yaw + i * Math.PI, 0, 'YXZ')), sc.set(0.008 * S, 0.0025 * S, 0.026 * S));
      this.pool.leaf.setMatrixAt(p.leaf + i, m4);
    }
    // petals
    if (p.petal !== null) for (let i = 0; i < V.petals; i++) {
      const yaw = p.yaw + (i / V.petals) * Math.PI * 2;
      const tilt = V.tilt * (1.0 - 0.45 * Math.min(1, p.growth)) + 0.2;
      m4.compose(top, q.setFromEuler(e.set(-tilt, yaw, 0, 'YXZ')), sc.set(V.petalW * S, 0.003 * S, V.petalLen * S * 0.5));
      this.pool.petal.setMatrixAt(p.petal + i, m4);
    }
    if (p.center !== null) {
      const im = V.glow ? this.pool.glow : this.pool.center;
      const r = V.center * S * (V.glow ? (0.9 + 0.15 * Math.sin(this.time * 3 + p.seed)) : 1);
      m4.compose(top, q.identity(), sc.set(r, r * (p.variant === 3 ? 0.45 : 1), r));
      im.setMatrixAt(p.center, m4);
    }
  }

  _flagAll() { for (const k in this.pool) this.pool[k].instanceMatrix.needsUpdate = true; }

  // ---------- Heart Bloom: the live biofeedback flower ----------
  _buildHero() {
    const g = new THREE.Group();
    g.position.set(0, BED.y, BED.z);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.01, 0.2, 8), new THREE.MeshStandardMaterial({ color: '#4f8a3c' }));
    stem.position.y = 0.1; g.add(stem);
    const head = new THREE.Group(); head.position.y = 0.2; g.add(head);
    this.heroMat = new THREE.MeshStandardMaterial({ color: '#ff8fab', emissive: '#ff5c8a', emissiveIntensity: 0.15, roughness: 0.5, side: THREE.DoubleSide });
    const petalGeo = new THREE.SphereGeometry(1, 16, 10); petalGeo.translate(0, 0, 1);
    this.heroPetals = [];
    for (let i = 0; i < 8; i++) {
      const pivot = new THREE.Group(); pivot.rotation.order = 'YXZ'; pivot.rotation.y = (i / 8) * Math.PI * 2;
      const petal = new THREE.Mesh(petalGeo, this.heroMat);
      petal.scale.set(0.03, 0.006, 0.055);
      pivot.add(petal); head.add(pivot); this.heroPetals.push(petal);
    }
    this.heroCore = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 12), new THREE.MeshStandardMaterial({ color: '#ffd166', emissive: '#ffb703', emissiveIntensity: 0.4 }));
    head.add(this.heroCore);
    this.heroHead = head; this.hero = g;
    this.heroOpen = 0.3; this.heroFan = 0.5; this.heroFace = 0; this.heroPulse = 0;
    this.bedGroup.add(g);
  }
  setHero({ open, fan, face, hue } = {}) {
    if (open !== undefined) this.heroOpen = open;
    if (fan !== undefined) this.heroFan = fan;
    if (face !== undefined) this.heroFace = face;
    if (hue !== undefined) { this.heroMat.color.setHSL(hue, 0.8, 0.72); this.heroMat.emissive.setHSL(hue, 0.9, 0.5); }
  }
  pulseHero() { this.heroPulse = 1; }

  update(dt) {
    this.time += dt;
    // grow
    for (const p of this.growing) {
      p.growth += dt / 1.4;
      if (p.growth >= 1) { p.growth = 1; this.growing.delete(p); }
      this._writePlant(p);
    }
    // gentle sway for a handful of bed plants each frame (cheap)
    const n = this.plants.length;
    if (n) for (let k = 0; k < Math.min(12, n); k++) { const p = this.plants[(Math.floor(this.time * 60) * 12 + k) % n]; if (!this.growing.has(p)) this._writePlant(p); }
    this._flagAll();
    // hero
    const o = this.heroOpen, fanW = 0.02 + this.heroFan * 0.026;
    this.heroPetals.forEach((pt, i) => {
      pt.parent.rotation.x = -(1.35 - o * 1.25);
      pt.scale.x += (fanW - pt.scale.x) * 0.25;
    });
    this.heroHead.rotation.x += ((-this.heroFace * 0.9) - this.heroHead.rotation.x) * 0.1;
    this.heroPulse = Math.max(0, this.heroPulse - dt * 2.5);
    const s = 1 + this.heroPulse * 0.35;
    this.heroCore.scale.setScalar(s);
    this.heroMat.emissiveIntensity = 0.15 + this.heroPulse * 0.8;
    // pollen drift
    const pp = this.pollen.geometry.attributes.position;
    for (let i = 0; i < pp.count; i++) { let y = pp.getY(i) + dt * 0.03; if (y > 1.3) y = -0.9; pp.setY(i, y); pp.setX(i, pp.getX(i) + Math.sin(this.time * 0.5 + i) * dt * 0.01); }
    pp.needsUpdate = true;
    this.sparkles.update(dt);
  }

  setMR(on) { this.env.visible = !on; }
}

// Pooled sparkle bursts for celebrations.
class Sparkles {
  constructor(parent) {
    this.N = 400;
    this.pos = new Float32Array(this.N * 3); this.vel = new Float32Array(this.N * 3); this.life = new Float32Array(this.N); this.colors = new Float32Array(this.N * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ map: dotTexture(), size: 0.022, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.points.frustumCulled = false;
    parent.add(this.points);
    this.i = 0;
  }
  emit(p, color, n = 30, speed = 0.35) {
    const c = new THREE.Color(color);
    for (let k = 0; k < n; k++) {
      const i = this.i = (this.i + 1) % this.N;
      this.pos.set([p.x, p.y, p.z], i * 3);
      const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 2 - 1), s = speed * (0.4 + Math.random() * 0.6);
      this.vel.set([Math.sin(ph) * Math.cos(th) * s, Math.abs(Math.cos(ph)) * s * 0.9 + 0.1, Math.sin(ph) * Math.sin(th) * s], i * 3);
      this.colors.set([c.r, c.g, c.b], i * 3);
      this.life[i] = 1;
    }
  }
  update(dt) {
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -999; continue; }
      this.life[i] -= dt * 1.1;
      for (let k = 0; k < 3; k++) this.pos[i * 3 + k] += this.vel[i * 3 + k] * dt;
      this.vel[i * 3 + 1] -= dt * 0.25;
      const f = Math.max(0, this.life[i]);
      this.colors[i * 3] *= 0.985; this.colors[i * 3 + 1] *= 0.985; this.colors[i * 3 + 2] *= 0.985;
      if (f <= 0) this.pos[i * 3 + 1] = -999;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

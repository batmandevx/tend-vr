// The persistent garden: golden-hour environment, planter, instanced sculpted plants,
// wind-swept grass, pond, butterflies, the live "heart bloom", and sparkles.
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

export const BED = { y: -0.5, z: -0.48, r: 0.4 };
const easeOutBack = (t) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
export function seeded(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

let _dot;
export function dotTexture() {
  if (_dot) return _dot;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return (_dot = new THREE.CanvasTexture(c));
}

// ---------- sculpted geometry ----------
// A cupped, teardrop petal of unit length along +Z, unit full width. Vertex colours darken toward the base.
function petalGeometry({ cup = 0.35, curlTip = 0.1, segL = 7, segW = 4, base = 0.55, fold = 0 } = {}) {
  const pos = [], col = [], idx = [];
  for (let i = 0; i <= segL; i++) {
    const t = i / segL;
    const half = 0.5 * Math.sin(Math.PI * Math.pow(t, 1.25)) + 0.03 * (1 - t);
    for (let j = 0; j <= segW; j++) {
      const s = (j / segW) * 2 - 1;
      const x = s * half;
      const y = cup * t * t + 0.18 * cup * s * s + fold * Math.abs(s) * half - curlTip * Math.pow(t, 6);
      pos.push(x, y, t);
      const k = base + (1 - base) * Math.min(1, t * 1.6) - 0.06 * Math.abs(s);
      col.push(k, k, k);
    }
  }
  for (let i = 0; i < segL; i++) for (let j = 0; j < segW; j++) {
    const a = i * (segW + 1) + j, b = a + segW + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function bladeGeometry() {
  const pos = [], col = [], idx = [], seg = 4;
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, w = 0.5 * (1 - t) * (1 - t * 0.3);
    pos.push(-w, t, t * t * 0.15, w, t, t * t * 0.15);
    const k = 0.3 + 0.55 * t; col.push(k, k, k, k, k, k);
  }
  for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function canvasTex(w, h, draw, repeat = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, 1); t.anisotropy = 4;
  return t;
}

// Plant variants, one per exercise. Sizes in metres at scale 1.
export const VARIANTS = [
  { name: 'Tulip', petals: 6, len: 0.042, w: 0.03, tilt: 1.2, cup: 0.45, stem: 0.12, center: 0.007, sat: 0.78, light: 0.6 },
  { name: 'Seedlight', petals: 5, len: 0.026, w: 0.022, tilt: 0.55, cup: 0.3, stem: 0.07, center: 0.011, glow: true, sat: 0.7, light: 0.72 },
  { name: 'Fern', petals: 8, len: 0.085, w: 0.02, tilt: 0.55, cup: -0.1, stem: 0.025, center: 0, green: true, fold: 0.3 },
  { name: 'Sunflower', petals: 14, len: 0.034, w: 0.013, tilt: 0.12, cup: 0.12, stem: 0.16, center: 0.017, hueFix: 0.12, sat: 0.95, light: 0.55, disk: true },
  { name: 'Lantern', petals: 4, len: 0.022, w: 0.016, tilt: 1.5, cup: 0.5, stem: 0.1, center: 0.012, glow: true, hueFix: 0.12, sat: 0.9, light: 0.62 },
];

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();

export class Garden {
  constructor(world, renderer, scene) {
    this.world = world; this.renderer = renderer; this.scene = scene;
    this.env = new THREE.Group();
    this.bedGroup = new THREE.Group();
    world.add(this.env, this.bedGroup);
    this.time = 0;
    this.plants = [];
    this.growing = new Set();
    this.floorY = -1.15;
    this.daylight = 1;
    this._buildLights();
    this._buildSky();
    this._buildGround();
    this._buildPond();
    this._buildTrees();
    this._buildBed();
    this._buildPools();
    this._buildHero();
    this.butterflies = new Butterflies(this.env);
    this.sparkles = new Sparkles(world);
    this.setDaylight(1);
  }

  setFloorY(y) { this.floorY = y; this.env.position.y = y + 1.15; this._placeBedLegs(); this._repositionMeadow(); }

  _buildLights() {
    this.hemi = new THREE.HemisphereLight('#ffe9cf', '#5b7a45', 1.8);
    this.sun = new THREE.DirectionalLight('#ffd9a8', 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const c = this.sun.shadow.camera; c.left = -0.9; c.right = 0.9; c.top = 0.9; c.bottom = -0.9; c.near = 0.1; c.far = 6;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.01; this.sun.shadow.radius = 4;
    this.sun.target.position.set(0, BED.y, BED.z);
    this.world.add(this.hemi, this.sun, this.sun.target);
  }

  _buildSky() {
    const sky = this.sky = new Sky();
    sky.scale.setScalar(180);
    const u = sky.material.uniforms;
    u.turbidity.value = 3.2; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.006; u.mieDirectionalG.value = 0.86;
    u.cloudCoverage.value = 0.32; u.cloudDensity.value = 0.45; u.cloudSpeed.value = 0.00006; u.cloudScale.value = 0.00025;
    this.env.add(sky);
    this.sunDir = new THREE.Vector3();
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
  }

  // daylight 0 = pre-dawn, 1 = golden hour
  setDaylight(k, rebuildEnv = true) {
    this.daylight = k;
    const elev = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(-4, 16, k)), az = THREE.MathUtils.degToRad(this.sunAzimuth ?? 140);
    this.sunDir.setFromSphericalCoords(1, Math.PI / 2 - elev, az + Math.PI);
    this.sky.material.uniforms.sunPosition.value.copy(this.sunDir);
    this.sun.position.copy(this.sun.target.position).addScaledVector(this.sunDir, 3);
    this.sun.position.y = Math.max(this.sun.position.y, BED.y + 0.9);
    this.sun.intensity = 3.2 * THREE.MathUtils.smoothstep(k, 0.05, 0.8);
    this.hemi.intensity = 0.35 + 0.75 * k;
    this.scene.environmentIntensity = 0.35 + 0.6 * k;
    if (this.pondMat) this.pondMat.uniforms.day.value = k;
    if (this.scene.fog) this.scene.fog.color.setHSL(0.56, 0.35, 0.35 + 0.4 * k);
    if (rebuildEnv) this._rebuildEnv();
  }
  _rebuildEnv() {
    const s = new THREE.Scene(); const sk = new Sky(); sk.scale.setScalar(100);
    for (const k in this.sky.material.uniforms) sk.material.uniforms[k].value = this.sky.material.uniforms[k].value;
    sk.material.uniforms.showSunDisc.value = 0;
    s.add(sk);
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(s, 0.02);
    this.scene.environment = this.envRT.texture;
  }

  _buildGround() {
    const env = this.env;
    const groundTex = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#6f9a4a'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) { const x = seeded(i) * w, y = seeded(i + 7) * h; g.fillStyle = `hsla(${85 + seeded(i + 3) * 30},${40 + seeded(i + 5) * 25}%,${28 + seeded(i + 9) * 22}%,0.5)`; g.fillRect(x, y, 2, 2 + seeded(i + 11) * 5); }
    }, 1);
    groundTex.repeat.set(40, 40);
    const groundGeo = new THREE.CircleGeometry(60, 64); groundGeo.rotateX(-Math.PI / 2);
    this.ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1, color: '#d8e6b8' }));
    this.ground.position.y = -1.15; this.ground.receiveShadow = true;
    env.add(this.ground);
    // distant hills
    const hillMat = new THREE.MeshStandardMaterial({ color: '#7f9f62', roughness: 1, flatShading: true });
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + 0.3;
      const h = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), hillMat);
      h.scale.set(10 + seeded(i) * 8, 3 + seeded(i + 3) * 4, 8 + seeded(i + 5) * 5);
      h.position.set(Math.cos(a) * 44, -1.8, Math.sin(a) * 44);
      env.add(h);
    }
    // wind-swept grass
    const N = 26000;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1, envMapIntensity: 0.35 });
    this.grassUniforms = { uTime: { value: 0 } };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.grassUniforms.uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz;
          float gust = sin(uTime * 0.7 + ip.x * 0.35 + ip.z * 0.2) * 0.5 + 0.5;
          float wv = sin(uTime * 2.1 + ip.x * 1.7 + ip.z * 1.3) * (0.18 + 0.32 * gust);
          transformed.z += wv * position.y * position.y;
          transformed.x += 0.4 * wv * position.y * position.y * sin(ip.x);
        #endif`);
    };
    const grass = this.grass = new THREE.InstancedMesh(bladeGeometry(), mat, N);
    let n = 0;
    for (let i = 0; n < N && i < N * 3; i++) {
      const r = 0.55 + Math.pow(seeded(i * 1.3), 1.6) * 9, a = seeded(i * 2.7 + 1) * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.hypot((x - 3.2) / 1.5, z + 4.5) < 2.5) continue; // pond
      if (Math.hypot(x, z - BED.z) < BED.r + 0.05) continue; // planter
      const hgt = 0.1 + seeded(i + 5) * 0.22 + (r > 3 ? 0.1 : 0);
      m4.compose(v.set(x, -1.15, z), q.setFromEuler(e.set((seeded(i + 4) - 0.5) * 0.4, seeded(i + 3) * 6.28, 0)), sc.set(0.012 + seeded(i + 8) * 0.01, hgt, 1));
      grass.setMatrixAt(n, m4);
      grass.setColorAt(n, col.setHSL(0.21 + seeded(i + 6) * 0.08, 0.5 + seeded(i + 9) * 0.2, 0.2 + seeded(i + 2) * 0.12));
      n++;
    }
    grass.count = n; grass.frustumCulled = false;
    env.add(grass);
  }
  setGrassDensity(f) { this.grass.count = Math.floor(this.grass.instanceMatrix.count * f); }

  _buildPond() {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, day: { value: 1 }, deep: { value: new THREE.Color('#3f8590') }, sky: { value: new THREE.Color('#cfe3ea') } },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
      fragmentShader: `uniform float uTime; uniform float day; uniform vec3 deep; uniform vec3 sky; varying vec3 vW;
        void main(){
          vec3 V = normalize(cameraPosition - vW);
          float r = sin(vW.x*3.1+uTime*0.9)*sin(vW.z*2.7-uTime*0.7) * 0.6 + 0.4*sin((vW.x-vW.z)*5.3+uTime*1.4);
          float fres = pow(1.0 - clamp(V.y + r*0.04, 0.0, 1.0), 1.6);
          vec3 c = mix(deep, sky, clamp(0.25 + fres*0.75, 0.0, 1.0));
          c *= 0.92 + 0.08 * r;
          c *= 0.25 + 0.75 * day;
          gl_FragColor = vec4(c, 0.96);
          #include <colorspace_fragment>
        }`,
      transparent: true,
    });
    this.pondMat = mat;
    const pond = new THREE.Mesh(new THREE.CircleGeometry(2.4, 48), mat);
    pond.rotation.x = -Math.PI / 2; pond.position.set(3.2, -1.14, -4.5); pond.scale.set(1.5, 1, 1);
    this.env.add(pond);
    const rim = new THREE.Mesh(new THREE.RingGeometry(2.35, 2.6, 48), new THREE.MeshStandardMaterial({ color: '#8c8270', roughness: 1 }));
    rim.rotation.x = -Math.PI / 2; rim.position.set(3.2, -1.145, -4.5); rim.scale.set(1.5, 1, 1); this.env.add(rim);
    const padMat = new THREE.MeshStandardMaterial({ color: '#3f7a32', roughness: 0.95, envMapIntensity: 0.3 });
    const bloomMat = new THREE.MeshStandardMaterial({ color: '#ffb3c7', roughness: 0.5 });
    for (let i = 0; i < 9; i++) {
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.22 + seeded(i) * 0.15, 20, 0.3, Math.PI * 1.85), padMat);
      pad.rotation.set(-Math.PI / 2, 0, seeded(i + 2) * 6);
      pad.position.set(3.2 + (seeded(i + 4) - 0.5) * 4.6, -1.13, -4.5 + (seeded(i + 6) - 0.5) * 3.2);
      this.env.add(pad);
      if (i % 3 === 0) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), bloomMat); b.scale.y = 0.6; b.position.copy(pad.position).add(v.set(0, 0.04, 0)); this.env.add(b); }
    }
    const reedMat = new THREE.MeshStandardMaterial({ color: '#6b8f3e', roughness: 0.9 });
    const reeds = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.008, 0.014, 1, 5).translate(0, 0.5, 0), reedMat, 60);
    for (let i = 0; i < 60; i++) {
      const a = 2.2 + seeded(i) * 1.6, r = 2.5 + seeded(i + 1) * 0.4;
      m4.compose(v.set(3.2 + Math.cos(a) * r * 1.5, -1.15, -4.5 + Math.sin(a) * r), q.setFromEuler(e.set((seeded(i + 2) - 0.5) * 0.3, 0, (seeded(i + 3) - 0.5) * 0.3)), sc.set(0.8, 0.35 + seeded(i + 4) * 0.5, 0.8));
      reeds.setMatrixAt(i, m4);
    }
    this.env.add(reeds);
  }

  _buildTrees() {
    const trunkGeo = new THREE.CylinderGeometry(0.07, 0.13, 1, 7); trunkGeo.translate(0, 0.5, 0);
    const crownGeo = new THREE.IcosahedronGeometry(1, 1);
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: '#6e4f37', roughness: 1 }), 46);
    const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), 46 * 3);
    let n = 0, c = 0;
    for (let k = 0; k < 120 && n < 46; k++) {
      const a = seeded(k * 3) * Math.PI * 2, r = 6.5 + seeded(k * 7) * 18;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.hypot((x - 3.2) / 1.5, z + 4.5) < 3.2) continue;
      const hgt = 1.5 + seeded(k) * 2.2;
      m4.compose(v.set(x, -1.15, z), q.identity(), sc.set(1, hgt, 1)); trunks.setMatrixAt(n++, m4);
      const cr = 0.8 + seeded(k + 1) * 0.8;
      const hue = 0.22 + seeded(k + 2) * 0.11, light = 0.3 + seeded(k + 4) * 0.14;
      for (let b = 0; b < 3; b++) {
        const off = v.set((seeded(k + b * 5) - 0.5) * cr, hgt + cr * (0.4 + b * 0.35), (seeded(k + b * 9) - 0.5) * cr);
        m4.compose(off.add(new THREE.Vector3(x, -1.15, z)), q.setFromEuler(e.set(0, seeded(k + b) * 6, 0)), sc.setScalar(cr * (1 - b * 0.22)));
        crowns.setMatrixAt(c, m4); crowns.setColorAt(c, col.setHSL(hue, 0.55, (light + b * 0.04) * 0.8)); c++;
      }
    }
    trunks.count = n; crowns.count = c;
    this.env.add(trunks, crowns);
  }

  _buildBed() {
    const g = this.bedGroup;
    const woodTex = canvasTex(1024, 256, (ctx, w, h) => {
      const planks = 24;
      for (let i = 0; i < planks; i++) {
        const x = (i / planks) * w, pw = w / planks;
        ctx.fillStyle = `hsl(${24 + seeded(i) * 8}, ${38 + seeded(i + 1) * 12}%, ${36 + seeded(i + 2) * 10}%)`; ctx.fillRect(x, 0, pw, h);
        for (let k = 0; k < 30; k++) { ctx.strokeStyle = `rgba(60,35,20,${0.08 + seeded(i * 40 + k) * 0.12})`; ctx.lineWidth = 1; ctx.beginPath(); const gx = x + seeded(i * 40 + k + 3) * pw; ctx.moveTo(gx, 0); ctx.bezierCurveTo(gx + 3, h * 0.3, gx - 3, h * 0.7, gx + 1, h); ctx.stroke(); }
        ctx.fillStyle = 'rgba(30,18,10,0.55)'; ctx.fillRect(x, 0, 2, h);
      }
      ctx.fillStyle = 'rgba(70,70,75,0.85)'; ctx.fillRect(0, h * 0.14, w, 10); ctx.fillRect(0, h * 0.8, w, 10);
    }, 2);
    const wood = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.75 });
    const rimMat = new THREE.MeshStandardMaterial({ color: '#8a5f3d', roughness: 0.7 });
    this.rim = new THREE.Mesh(new THREE.TorusGeometry(BED.r + 0.02, 0.026, 12, 64), rimMat);
    this.rim.rotation.x = -Math.PI / 2; this.rim.position.set(0, BED.y, BED.z); this.rim.castShadow = this.rim.receiveShadow = true;
    const soilTex = canvasTex(512, 512, (ctx, w, h) => {
      ctx.fillStyle = '#4a3123'; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 7000; i++) { ctx.fillStyle = `hsla(${20 + seeded(i) * 15},${30 + seeded(i + 1) * 20}%,${12 + seeded(i + 2) * 22}%,0.8)`; const s = 1 + seeded(i + 3) * 3; ctx.fillRect(seeded(i + 4) * w, seeded(i + 5) * h, s, s); }
      for (let i = 0; i < 400; i++) { ctx.fillStyle = `hsla(95,35%,${26 + seeded(i) * 12}%,0.18)`; ctx.beginPath(); ctx.arc(seeded(i + 9) * w, seeded(i + 10) * h, 1 + seeded(i + 11) * 3, 0, 7); ctx.fill(); }
    });
    this.soil = new THREE.Mesh(new THREE.CylinderGeometry(BED.r, BED.r, 0.03, 64), new THREE.MeshStandardMaterial({ map: soilTex, roughness: 1 }));
    this.soil.position.set(0, BED.y - 0.012, BED.z); this.soil.receiveShadow = true;
    this.base = new THREE.Mesh(new THREE.CylinderGeometry(BED.r + 0.035, BED.r - 0.03, 1, 64, 1, true), wood);
    this.base.castShadow = this.base.receiveShadow = true;
    g.add(this.rim, this.soil, this.base);
    this._placeBedLegs();
  }
  _placeBedLegs() {
    const h = Math.max(0.05, (BED.y - 0.03) - this.floorY);
    this.base.scale.set(1, h, 1);
    this.base.position.set(0, BED.y - 0.03 - h / 2, BED.z);
  }

  _buildPools() {
    const petalGeo = petalGeometry({ cup: 0.38 });
    const leafGeo = petalGeometry({ cup: -0.05, fold: 0.35, base: 0.7, curlTip: 0.15 });
    const stemGeo = new THREE.CylinderGeometry(1, 1.3, 1, 6); stemGeo.translate(0, 0.5, 0);
    const ballGeo = new THREE.SphereGeometry(1, 14, 10);
    const mk = (geo, mat, n, shadow = true) => { const im = new THREE.InstancedMesh(geo, mat, n); im.count = 0; im.frustumCulled = false; im.castShadow = shadow; im.receiveShadow = shadow; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.bedGroup.add(im); return im; };
    this.pool = {
      petal: mk(petalGeo, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.5 }), 7000),
      leaf: mk(leafGeo, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.7 }), 3600),
      stem: mk(stemGeo, new THREE.MeshStandardMaterial({ color: '#4c8a3a', roughness: 0.8 }), 900),
      center: mk(ballGeo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), 900),
      glow: mk(ballGeo, new THREE.MeshBasicMaterial({ toneMapped: false }), 900, false),
    };
    for (const k of ['petal', 'center', 'glow', 'leaf']) this.pool[k].setColorAt(0, col.set('#fff'));
    this.halos = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: dotTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0.3 }), 900);
    this.halos.count = 0; this.halos.frustumCulled = false; this.halos.setColorAt(0, col.set('#fff')); this.bedGroup.add(this.halos);
  }

  _alloc(kind, n) {
    const im = kind === 'halo' ? this.halos : this.pool[kind];
    if (im.count + n > im.instanceMatrix.count) return null;
    const start = im.count; im.count += n;
    return start;
  }

  // Deterministic placement: Vogel spiral in the bed, then a meadow around the user.
  slotPosition(n, out) {
    const BED_SLOTS = 150, golden = 2.39996323;
    if (n < BED_SLOTS) {
      const r = Math.sqrt(0.1 * 0.1 + n * 0.00093), a = n * golden;
      return { pos: out.set(Math.cos(a) * r, BED.y, BED.z + Math.sin(a) * r), scale: 1, meadow: false };
    }
    const k = n - BED_SLOTS, r = 1.0 + Math.sqrt(k) * 0.15, a = k * golden;
    return { pos: out.set(Math.cos(a) * r, this.floorY, Math.sin(a) * r - 0.2), scale: 2.6, meadow: true };
  }
  _repositionMeadow() { for (const p of this.plants) if (p.meadow) { p.pos.y = this.floorY; this._writePlant(p); } }

  addPlant(variant, hue, seed, animate = true) {
    const n = this.plants.length, V = VARIANTS[variant];
    const slot = this.slotPosition(n, new THREE.Vector3());
    const p = {
      variant, hue, seed, pos: slot.pos, scale: slot.scale * (0.85 + seeded(seed) * 0.3), meadow: slot.meadow,
      growth: animate ? 0 : 1, yaw: seeded(seed + 1) * Math.PI * 2,
      stem: this._alloc('stem', 1), leaf: this._alloc('leaf', 2),
      petal: V.petals ? this._alloc(V.green ? 'leaf' : 'petal', V.petals) : null,
      center: V.center ? this._alloc(V.glow ? 'glow' : 'center', 1) : null,
      halo: V.glow ? this._alloc('halo', 1) : null,
    };
    if (p.stem === null) return null;
    const hueFinal = V.hueFix ?? hue;
    const petalPool = V.green ? this.pool.leaf : this.pool.petal;
    if (p.petal !== null) {
      for (let i = 0; i < V.petals; i++) {
        if (V.green) col.setHSL(0.27 + seeded(seed + i) * 0.06, 0.55, 0.36 + seeded(seed + i * 2) * 0.1);
        else col.setHSL(hueFinal + (seeded(seed + i) - 0.5) * 0.03, V.sat, V.light + (seeded(seed + i * 3) - 0.5) * 0.08);
        petalPool.setColorAt(p.petal + i, col);
      }
      petalPool.instanceColor.needsUpdate = true;
    }
    if (p.center !== null) {
      const im = V.glow ? this.pool.glow : this.pool.center;
      if (V.glow) col.setHSL(hueFinal, 0.95, 0.7); else if (V.disk) col.set('#4a2c14'); else col.setHSL(0.13, 0.95, 0.58);
      im.setColorAt(p.center, col); im.instanceColor.needsUpdate = true;
    }
    if (p.halo !== null) { this.halos.setColorAt(p.halo, col.setHSL(hueFinal, 0.9, 0.6)); this.halos.instanceColor.needsUpdate = true; }
    for (let i = 0; i < 2; i++) this.pool.leaf.setColorAt(p.leaf + i, col.setHSL(0.28, 0.5, 0.36 + seeded(seed + i) * 0.08));
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
    const sway = Math.sin(this.time * 1.3 + p.seed) * 0.05 * (p.growth >= 1 ? 1 : 0);
    const h = V.stem * S;
    q.setFromEuler(e.set(sway, 0, sway * 0.6));
    m4.compose(p.pos, q, sc.set(0.0032 * S, h, 0.0032 * S));
    this.pool.stem.setMatrixAt(p.stem, m4);
    const top = v.set(0, h, 0).applyQuaternion(q).add(p.pos).clone();
    for (let i = 0; i < 2; i++) {
      const lp = new THREE.Vector3(0, h * (0.25 + i * 0.2), 0).applyQuaternion(q).add(p.pos);
      m4.compose(lp, q2.setFromEuler(e.set(-0.45, p.yaw + i * Math.PI + 0.4, 0, 'YXZ')), sc.set(0.022 * S, 0.05 * S, 0.05 * S));
      this.pool.leaf.setMatrixAt(p.leaf + i, m4);
    }
    if (p.petal !== null) {
      const pool = V.green ? this.pool.leaf : this.pool.petal;
      for (let i = 0; i < V.petals; i++) {
        const yaw = p.yaw + (i / V.petals) * Math.PI * 2 + (V.petals === 6 && i % 2 ? 0.25 : 0);
        const open = Math.min(1, p.growth);
        const tilt = V.tilt * (1.15 - 0.3 * open) + (i % 2 ? 0.08 : 0);
        const L = V.len * S * (V.petals === 6 && i % 2 ? 0.88 : 1);
        m4.compose(top, q2.setFromEuler(e.set(-tilt, yaw, 0, 'YXZ')), sc.set(V.w * S, L, L));
        pool.setMatrixAt(p.petal + i, m4);
      }
    }
    if (p.center !== null) {
      const im = V.glow ? this.pool.glow : this.pool.center;
      const r = V.center * S * (V.glow ? (0.9 + 0.12 * Math.sin(this.time * 3 + p.seed)) : 1);
      const cpos = V.petals && V.tilt > 1.3 ? top.clone().add(v.set(0, -0.004 * S, 0)) : top;
      m4.compose(cpos, q.identity(), sc.set(r, r * (V.disk ? 0.4 : 1), r));
      im.setMatrixAt(p.center, m4);
      if (p.halo !== null) { p.haloPos = cpos.clone(); p.haloScale = r * 5; }
    }
  }
  _flagAll() { for (const k in this.pool) this.pool[k].instanceMatrix.needsUpdate = true; this.halos.instanceMatrix.needsUpdate = true; }

  // ---------- Heart Bloom: the live biofeedback flower ----------
  _buildHero() {
    const g = new THREE.Group(); g.position.set(0, BED.y, BED.z);
    const stemCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.006, 0.08, 0), new THREE.Vector3(-0.004, 0.16, 0.004), new THREE.Vector3(0, 0.22, 0)]);
    const stem = new THREE.Mesh(new THREE.TubeGeometry(stemCurve, 20, 0.0055, 8), new THREE.MeshStandardMaterial({ color: '#4c8a3a', roughness: 0.7 }));
    stem.castShadow = true; g.add(stem);
    const leafGeo = petalGeometry({ cup: -0.05, fold: 0.35, base: 0.7 });
    const leafMat = new THREE.MeshStandardMaterial({ color: '#5aa045', vertexColors: true, side: THREE.DoubleSide, roughness: 0.6 });
    for (let i = 0; i < 2; i++) { const l = new THREE.Mesh(leafGeo, leafMat); l.scale.set(0.035, 0.08, 0.08); l.position.y = 0.05 + i * 0.05; l.rotation.set(-0.5, i * Math.PI + 0.6, 0, 'YXZ'); l.castShadow = true; g.add(l); }
    const head = new THREE.Group(); head.position.y = 0.22; g.add(head);
    this.heroMat = new THREE.MeshPhysicalMaterial({ color: '#f2668f', emissive: '#e0406f', emissiveIntensity: 0.1, roughness: 0.5, sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ffd6e2'), side: THREE.DoubleSide, vertexColors: true });
    const pg = petalGeometry({ cup: 0.42, curlTip: 0.12, segL: 10, segW: 6, base: 0.5 });
    this.heroPetals = [];
    for (let layer = 0; layer < 2; layer++) for (let i = 0; i < (layer ? 6 : 9); i++) {
      const pivot = new THREE.Group(); pivot.rotation.order = 'YXZ'; pivot.rotation.y = (i / (layer ? 6 : 9)) * Math.PI * 2 + layer * 0.3;
      const petal = new THREE.Mesh(pg, this.heroMat);
      const L = layer ? 0.048 : 0.068; petal.scale.set(layer ? 0.034 : 0.044, L, L);
      petal.castShadow = true; petal.userData.layer = layer;
      pivot.add(petal); head.add(pivot); this.heroPetals.push(petal);
    }
    this.heroCore = new THREE.Mesh(new THREE.SphereGeometry(0.02, 20, 14), new THREE.MeshStandardMaterial({ color: '#ffd166', emissive: '#ffb703', emissiveIntensity: 0.5, roughness: 0.6 }));
    this.heroCore.scale.y = 0.7; head.add(this.heroCore);
    this.heroGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshBasicMaterial({ map: dotTexture(), color: '#ffc2d4', transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    head.add(this.heroGlow);
    g.scale.setScalar(1.3);
    this.heroHead = head; this.hero = g;
    this.heroOpen = 0.3; this.heroFan = 0.5; this.heroFace = 0; this.heroPulse = 0;
    this.bedGroup.add(g);
  }
  setHero({ open, fan, face, hue } = {}) {
    if (open !== undefined) this.heroOpen = open;
    if (fan !== undefined) this.heroFan = fan;
    if (face !== undefined) this.heroFace = face;
    if (hue !== undefined) { this.heroMat.color.setHSL(hue, 0.78, 0.6); this.heroMat.emissive.setHSL(hue, 0.85, 0.42); this.heroGlow.material.color.setHSL(hue, 0.9, 0.75); }
  }
  pulseHero() { this.heroPulse = 1; }

  update(dt, camera) {
    this.time += dt;
    this.grassUniforms.uTime.value = this.time;
    this.pondMat.uniforms.uTime.value = this.time;
    this.sky.material.uniforms.time.value = this.time;
    for (const p of this.growing) { p.growth += dt / 1.4; if (p.growth >= 1) { p.growth = 1; this.growing.delete(p); } this._writePlant(p); }
    const n = this.plants.length;
    if (n) for (let k = 0; k < Math.min(14, n); k++) { const p = this.plants[(Math.floor(this.time * 60) * 14 + k) % n]; if (!this.growing.has(p)) this._writePlant(p); }
    // hero
    const o = this.heroOpen;
    for (const pt of this.heroPetals) {
      const layer = pt.userData.layer;
      const target = -(1.45 - o * (layer ? 1.05 : 1.3));
      pt.parent.rotation.x += (target - pt.parent.rotation.x) * Math.min(1, dt * 14);
      const fw = (layer ? 0.034 : 0.044) * (0.85 + this.heroFan * 0.45);
      pt.scale.x += (fw - pt.scale.x) * 0.25;
    }
    this.heroHead.rotation.x += ((-this.heroFace * 0.9) - this.heroHead.rotation.x) * 0.1;
    this.heroPulse = Math.max(0, this.heroPulse - dt * 2.2);
    const cs = (0.35 + 0.65 * Math.min(1, o * 1.4)) * (1 + this.heroPulse * 0.4);
    this.heroCore.scale.set(cs, 0.7 * cs, cs);
    this.heroMat.emissiveIntensity = 0.12 + this.heroPulse * 0.7;
    this.heroGlow.material.opacity = 0.15 + this.heroPulse * 0.7;
    if (camera) {
      const cp = camera.getWorldPosition(v.clone());
      this.heroGlow.lookAt(cp);
      // halos are billboards facing the viewer
      const local = this.bedGroup.worldToLocal(cp.clone());
      for (const p of this.plants) if (p.halo !== null && p.haloPos) {
        m4.lookAt(local, p.haloPos, THREE.Object3D.DEFAULT_UP);
        q.setFromRotationMatrix(m4);
        m4.compose(p.haloPos, q, sc.setScalar(p.haloScale));
        this.halos.setMatrixAt(p.halo, m4);
      }
    }
    this._flagAll();
    this.butterflies.update(dt, this.time);
    this.sparkles.update(dt);
  }

  setMR(on) { this.env.visible = !on; this.scene.environment = on ? null : this.envRT?.texture; }
}

// A few butterflies drifting around the garden.
class Butterflies {
  constructor(parent) {
    this.list = [];
    const palettes = [['#f28c28', '#2b1a10'], ['#6fb7ff', '#16314d'], ['#ffe16b', '#3a2c0a'], ['#ff9ec7', '#40182a'], ['#f6f1e7', '#2a2a2a']];
    palettes.forEach(([c1, c2], i) => {
      const tex = canvasTex(128, 128, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.fillStyle = c1; g.beginPath(); g.ellipse(w * 0.55, h * 0.36, w * 0.42, h * 0.3, -0.35, 0, 7); g.fill();
        g.beginPath(); g.ellipse(w * 0.45, h * 0.74, w * 0.3, h * 0.22, 0.4, 0, 7); g.fill();
        g.strokeStyle = c2; g.lineWidth = 7; g.beginPath(); g.ellipse(w * 0.55, h * 0.36, w * 0.42, h * 0.3, -0.35, 0, 7); g.stroke();
        g.fillStyle = '#fff'; for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(w * (0.75 + 0.03 * k), h * (0.2 + 0.07 * k), 4, 0, 7); g.fill(); }
      });
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.6 });
      const geo = new THREE.PlaneGeometry(0.05, 0.05); geo.translate(0.025, 0, 0); geo.rotateX(-Math.PI / 2);
      const b = new THREE.Group();
      const L = new THREE.Mesh(geo, mat), R = new THREE.Mesh(geo, mat); R.scale.x = -1;
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.003, 0.03, 4, 6), new THREE.MeshStandardMaterial({ color: '#2b2118' })); body.rotation.x = Math.PI / 2;
      b.add(L, R, body); parent.add(b);
      this.list.push({ g: b, L, R, seed: i * 1.7 + 0.3, r: 0.35 + i * 0.25 });
    });
  }
  update(dt, t) {
    for (const b of this.list) {
      const s = b.seed, tt = t * (0.18 + s * 0.02) + s * 10;
      const x = Math.sin(tt) * b.r + Math.sin(tt * 2.3) * 0.15, z = BED.z - 0.3 - Math.abs(Math.cos(tt * 0.8)) * b.r * 1.1, y = BED.y + 0.25 + Math.sin(tt * 1.7) * 0.15 + b.r * 0.3;
      const prev = b.g.position.clone();
      b.g.position.set(x, y + 1.15 - 1.15, z);
      const d = b.g.position.clone().sub(prev);
      if (d.lengthSq() > 1e-9) b.g.rotation.y = Math.atan2(d.x, d.z);
      const flap = Math.sin(t * 16 + s * 5) * 1.1;
      b.L.rotation.z = flap; b.R.rotation.z = -flap;
    }
  }
}

// Pooled sparkle bursts for celebrations.
class Sparkles {
  constructor(parent) {
    this.N = 500;
    this.pos = new Float32Array(this.N * 3); this.vel = new Float32Array(this.N * 3); this.life = new Float32Array(this.N); this.colors = new Float32Array(this.N * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ map: dotTexture(), size: 0.014, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.points.frustumCulled = false;
    parent.add(this.points);
    this.i = 0;
    for (let i = 0; i < this.N; i++) this.pos[i * 3 + 1] = -999;
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
      this.colors[i * 3] *= 0.985; this.colors[i * 3 + 1] *= 0.985; this.colors[i * 3 + 2] *= 0.985;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

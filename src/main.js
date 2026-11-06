import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { HandState, readXRHands, TIPS } from './hands.js';
import { analyzeHand, createFeatures, mirrorHand } from './gestures.js';
import { HandView } from './handview.js';
import { Garden, BED, VARIANTS } from './garden.js';
import { Panel, PanelInput, THEME, wrap } from './ui.js';
import { Sound } from './audio.js';
import * as store from './store.js';
import { EXERCISES, ORDER, createRunner } from './exercises.js';
import { SimHands, Autopilot } from './sim.js';
import { Keepsakes, mountDrawer } from './keepsakes.js';

const params = new URLSearchParams(location.search);
const FONT = '"Nunito", "Segoe UI", system-ui, sans-serif';
const PRAISE = ['Lovely.', 'Beautiful control.', 'That’s it.', 'Wonderful.', 'Nice and steady.', 'Your garden is growing.', 'Great work.'];
const HUES = { 0: [0.95, 0.02, 0.85, 0.08, 0.75], 1: [0.55, 0.6, 0.5, 0.65], 2: [0.3], 3: [0.12], 4: [0.14] };

class App {
  constructor() {
    this.profile = store.load();
    if (params.has('fresh')) this.profile = store.defaultProfile();
    this.sound = new Sound();
    this.sound.voice = this.profile.voice !== false;
    this.state = 'boot';
    this.mode = 'desktop'; // 'vr' | 'mr' | 'desktop'
    this._initRenderer();
    this._initScene();
    this._initHands();
    this._initUI();
    this._initDOM();
    this.keepsakes = new Keepsakes(this);
    mountDrawer(this.keepsakes);
    this.clock = new THREE.Clock();
    this._initTitle();
    if (params.has('capture')) {
      // deterministic frame stepping + hi-res frame export, for screenshots and the demo video
      window.__step = (dt) => this.loop(null, dt);
      window.THREE = THREE;
      window.__size = (w, h) => {
        this.fixedSize = [w, h];
        this.renderer.setPixelRatio(1); this.renderer.setSize(w, h, false);
        this.composer.setPixelRatio(1); this.composer.setSize(w, h);
        this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
      };
      window.__shot = (name, dir = '', type = 'image/png', quality = 0.92) => new Promise((resolve) => {
        this.loop(null, 0);
        this.renderer.domElement.toBlob((b) => fetch(`http://localhost:8765/?name=${encodeURIComponent(name)}&dir=${encodeURIComponent(dir)}`, { method: 'POST', body: b }).then(() => resolve(name)), type, quality);
      });
    }
    else this.renderer.setAnimationLoop((t, frame) => this.loop(frame));
    this.startIntro();
  }

  // ---------------- setup ----------------
  _initRenderer() {
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.setSize(innerWidth, innerHeight);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.5;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.xr.enabled = true;
    r.xr.setReferenceSpaceType('local-floor');
    r.xr.setFoveation(0.5);
    document.getElementById('app').appendChild(r.domElement);
    addEventListener('resize', () => { if (this.fixedSize) return; this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); r.setSize(innerWidth, innerHeight); this.composer?.setSize(innerWidth, innerHeight); });
  }
  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog('#b9cfdc', 18, 90);
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.01, 200);
    this.scene.add(this.camera);
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.garden = new Garden(this.world, this.renderer, this.scene);
    // desktop-only bloom (WebXR renders straight to the headset)
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.2, 0.45, 2.4));
    this.composer.addPass(new OutputPass());
    this.desktopHead(1.15);
    for (const [variant, hue, seed] of this.profile.plants) this.garden.addPlant(variant, hue, seed, false);
  }
  // ---------- sunrise opening ----------
  _initTitle() {
    const c = document.createElement('canvas'); c.width = 2048; c.height = 640;
    const g = c.getContext('2d');
    g.textAlign = 'center'; g.fillStyle = '#fffaf0';
    g.shadowColor = 'rgba(80,40,10,0.55)'; g.shadowBlur = 40;
    g.font = '800 300px "Nunito", "Segoe UI", system-ui, sans-serif'; g.fillText('Tend', 1024, 330);
    g.shadowBlur = 24; g.font = '600 86px "Nunito", "Segoe UI", system-ui, sans-serif'; g.fillText('a garden that grows with your hands', 1024, 500);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    this.title = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.28), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    this.title.position.set(0, 0.06, -0.95); this.title.renderOrder = 20; this.title.layers.set(5);
    this.world.add(this.title);
  }
  startIntro() {
    if (params.has('nointro')) { this.goWelcome(); return; }
    this.intro = { t: 0, rebuilt: 0 };
    this.state = 'intro0'; this.panel.visible = false; this.hud.visible = false;
    this.garden.setDaylight(0);
    this.garden.setHero({ open: 0 });
  }
  updateIntro(dt) {
    const I = this.intro; I.t += dt;
    const k = THREE.MathUtils.smoothstep(I.t, 0.3, 5.2);
    this.garden.setDaylight(k, false);
    const step = Math.floor(k * 4);
    if (step !== I.rebuilt) { I.rebuilt = step; this.garden._rebuildEnv(); }
    this.garden.setHero({ open: THREE.MathUtils.smoothstep(I.t, 2.2, 5.5) * 0.85 });
    if (I.t > 2.6 && !I.chimed) { I.chimed = true; this.sound.chime(4, 0.18); this.garden.sparkles.emit(new THREE.Vector3(0, BED.y + 0.24, BED.z), '#ffd1dc', 50, 0.3); }
    this.title.material.opacity = THREE.MathUtils.smoothstep(I.t, 1.2, 2.6) * (1 - THREE.MathUtils.smoothstep(I.t, 5.6, 6.6));
    if (I.t > 6.2) { this.intro = null; this.title.material.opacity = 0; this.garden.setDaylight(1); this.goWelcome(); }
  }

  desktopHead(h) {
    this.world.position.set(0, h, 0); this.world.rotation.set(0, 0, 0);
    this.garden.setFloorY(-h);
    this.camera.position.set(0, h + 0.12, 0.32);
    this.camera.lookAt(0, h - 0.2, -0.52);
  }
  _initHands() {
    this.real = { left: new HandState('left'), right: new HandState('right') };
    this.sim = { left: new HandState('left'), right: new HandState('right') };
    this.mirror = new HandState('left');
    this.views = {
      left: new HandView(this.scene, '#e6f5ff', '#4cc2ff', 0.92),
      right: new HandView(this.scene, '#e6f5ff', '#4cc2ff', 0.92),
      mirror: new HandView(this.scene, '#fff1cf', '#ffb03a', 0.92),
    };
    this.feats = { left: createFeatures(), right: createFeatures() };
    this.feat = this.feats.right;
    // target-joint highlight for pinch exercises
    const hl = new THREE.MeshBasicMaterial({ color: '#7fd4ff', transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false });
    this.highlights = [0, 1, 2, 3].map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.016, 16, 12), hl); m.visible = false; this.scene.add(m); return m; });
  }
  _initUI() {
    this.input = new PanelInput((id, panel) => this.onButton(id, panel));
    this.panel = new Panel(0.6, 0.4);
    this.panel.mesh.position.set(0, 0.0, -0.5);
    this.panel.mesh.rotation.x = -0.12;
    this.hud = new Panel(0.52, 0.17);
    this.hud.mesh.position.set(0, 0.03, -0.58);
    this.hud.mesh.rotation.x = -0.1;
    this.world.add(this.panel.mesh, this.hud.mesh);
    this.input.add(this.panel); this.input.add(this.hud);
    this.hud.visible = false;
    this.caption = '';
  }
  _initDOM() {
    const el = this.renderer.domElement;
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); ray.layers.enable(5);
    el.addEventListener('pointerdown', (e) => {
      this.sound.start();
      if (this.renderer.xr.isPresenting) return;
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
      const hits = ray.intersectObjects([this.panel.mesh, this.hud.mesh].filter((m) => m.visible));
      if (hits.length && hits[0].uv) {
        const p = hits[0].object.userData.panel, b = p.buttonAtUV(hits[0].uv.x, hits[0].uv.y);
        if (b) this.onButton(b.id, p);
      }
    });
    this.simHands = new SimHands(this);
    if (params.has('demo')) {
      this.simHands.autopilot = new Autopilot(this.simHands, this);
      if (params.get('demo') === 'mirror') { this.profile.hand = 'left'; this.profile.mirror = true; }
      document.body.classList.add('demo');
    }
    const vrBtn = document.getElementById('enter-vr'), mrBtn = document.getElementById('enter-mr');
    if (navigator.xr) {
      navigator.xr.isSessionSupported('immersive-vr').then((ok) => { if (ok) { vrBtn.hidden = false; vrBtn.onclick = () => this.enterXR('immersive-vr'); } });
      navigator.xr.isSessionSupported('immersive-ar').then((ok) => { if (ok) { mrBtn.hidden = false; mrBtn.onclick = () => this.enterXR('immersive-ar'); } });
    }
  }

  async enterXR(kind) {
    this.sound.start();
    try {
      const session = await navigator.xr.requestSession(kind, { optionalFeatures: ['local-floor', 'hand-tracking', 'layers'] });
      this.mode = kind === 'immersive-ar' ? 'mr' : 'vr';
      this.garden.setMR(this.mode === 'mr');
      this.scene.fog = this.mode === 'mr' ? null : this.scene.fog;
      this.garden.setGrassDensity(0.55);
      this.renderer.setClearAlpha(this.mode === 'mr' ? 0 : 1);
      await this.renderer.xr.setSession(session);
      this.needsRecenter = true;
      if (this.state === 'welcome') this.startIntro();
      document.body.classList.add('in-xr');
      session.addEventListener('visibilitychange', () => { if (session.visibilityState !== 'visible' && this.state === 'exercise') this.pause('Paused while you were away.'); });
      session.addEventListener('end', () => {
        document.body.classList.remove('in-xr'); this.mode = 'desktop'; this.garden.setMR(false);
        this.scene.fog = new THREE.Fog('#b9cfdc', 18, 90); this.garden.setGrassDensity(1); this.garden.setDaylight(this.garden.daylight); this.desktopHead(1.15);
        if (this.state === 'exercise') this.pause('Paused.');
      });
    } catch (e) { alert('Could not start XR: ' + e.message); }
  }

  recenter() {
    const cam = this.renderer.xr.getCamera();
    const p = new THREE.Vector3(), q = new THREE.Quaternion();
    cam.getWorldPosition(p); cam.getWorldQuaternion(q);
    if (p.lengthSq() === 0) return false;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q); fwd.y = 0;
    const yaw = Math.atan2(-fwd.x, -fwd.z);
    const headY = THREE.MathUtils.clamp(p.y, 0.7, 1.9);
    this.world.position.set(p.x, headY, p.z);
    this.world.rotation.set(0, yaw, 0);
    this.garden.setFloorY(-headY);
    return true;
  }

  // ---------------- hand plumbing ----------------
  get affected() { return this.profile.hand; }
  get healthy() { return this.profile.hand === 'left' ? 'right' : 'left'; }
  get mirrorOn() { return this.profile.mirror && this.profile.hand !== 'both'; }
  get hands() { return this.renderer.xr.isPresenting ? this.real : this.sim; }
  // the hand whose movement we measure
  measureHand() {
    const H = this.hands;
    if (this.profile.hand === 'both') return H.right.visible ? H.right : H.left;
    if (this.mirrorOn) return H[this.healthy];
    return H[this.affected].visible ? H[this.affected] : (this.renderer.xr.isPresenting ? H[this.affected] : H[this.simHands.side]);
  }
  sideSign() { return this.profile.hand === 'left' ? -1 : this.profile.hand === 'right' ? 1 : 0; }

  // ---------------- flow ----------------
  show(state) { this.panel.set(state); this.panel.visible = true; this.hud.visible = false; }
  say(text, speak = true) { this.caption = text; if (speak) this.sound.say(text); }

  goWelcome() {
    this.state = 'welcome';
    this.garden.setHero({ open: 0.75, fan: 0.5, face: 0, hue: 0.95 });
    const p = this.profile;
    if (!p.setupDone) {
      this.show({
        kicker: 'Tend', title: 'A garden that grows with your hands',
        body: 'For anyone rebuilding hand movement after a stroke, injury or arthritis. Short daily sessions — every gentle movement plants something new.',
        bodySize: 34, buttons: [{ id: 'start-setup', label: 'Let’s begin', primary: true }, { id: 'about', label: 'About & safety' }],
      });
      this.say('Welcome to Tend. A garden that grows with your hands.');
      return;
    }
    const st = store.streak(p), n = p.plants.length;
    const hr = new Date().getHours();
    const greet = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
    const last = p.sessions[p.sessions.length - 1];
    const doneToday = last && last.day === store.dayKey();
    this.show({
      kicker: st ? `${st}-day streak · ${n} plants` : `${n} plants in your garden`,
      title: doneToday ? 'Your garden is resting' : greet,
      body: doneToday ? 'You’ve already tended it today. Another short session is always welcome.' : `Ready for today’s ${p.length === 'quick' ? '3' : '6'}-minute session? Rest your elbows and get comfortable.`,
      buttons: [{ id: 'begin', label: doneToday ? 'Play again' : 'Begin session', primary: true }, { id: 'progress', label: 'Progress' }, { id: 'settings', label: 'Settings' }],
    });
  }

  goSetupHand() {
    this.state = 'setupHand';
    this.show({ kicker: 'Setup · 1 of 3', title: 'Which hand are we working on?', body: 'Choose the hand you want to strengthen. You can change this anytime.', buttons: [{ id: 'hand-left', label: 'Left' }, { id: 'hand-right', label: 'Right' }, { id: 'hand-both', label: 'Both' }] });
    this.say('Which hand are we working on today?');
  }
  goSetupMirror() {
    this.state = 'setupMirror';
    const h = this.profile.hand;
    this.show({
      kicker: 'Setup · 2 of 3', title: 'Try mirror therapy?', bodySize: 32,
      body: `If your ${h} hand is hard to move, Tend can show your ${this.healthy} hand’s movement reflected in its place — a golden hand. Watching it move while you try along can help the brain re-learn the movement.`,
      buttons: [{ id: 'mirror-on', label: 'Yes, mirror', primary: true }, { id: 'mirror-off', label: 'Not now' }],
    });
    this.say('Would you like to try mirror therapy?');
  }
  goSetupLength() {
    this.state = 'setupLength';
    this.show({ kicker: 'Setup · 3 of 3', title: 'How long is a session?', body: 'Short and daily beats long and rare. You can switch anytime.', buttons: [{ id: 'len-quick', label: 'Quick · 3 min' }, { id: 'len-full', label: 'Full · 6 min', primary: true }] });
  }

  // calibration: learn the user's own comfortable range
  goCalib() {
    this.state = 'calib'; this.calibStep = 0; this.calibT = 0; this.calibSamples = [];
    this.calibData = {};
    this.panel.visible = true;
    this._calibPanel();
    this.say('First, let’s learn your comfortable range. Hold your hand open and relaxed over the garden.');
  }
  _calibPanel() {
    const steps = [
      ['Open & relaxed', 'Hold your hand open over the garden, fingers relaxed.'],
      ['Spread wide', 'Now spread your fingers apart — only as far as is comfortable.'],
      ['Gentle fist', 'Now close your hand into a gentle fist. No pain, ever.'],
    ];
    const [title, body] = steps[this.calibStep];
    const prog = Math.min(1, this.calibT / 3);
    const visible = this.measureHand().visible;
    this.panel.set({
      kicker: `Learning your range · ${this.calibStep + 1} of 3`, title, body,
      custom: (ctx, W, H, y) => {
        ctx.fillStyle = '#e8e0cf'; ctx.beginPath(); ctx.roundRect(60, y + 10, W - 120, 26, 13); ctx.fill();
        ctx.fillStyle = THEME.accent; ctx.beginPath(); ctx.roundRect(60, y + 10, Math.max(26, (W - 120) * prog), 26, 13); ctx.fill();
        ctx.font = `700 30px ${FONT}`; ctx.fillStyle = visible ? THEME.accent : THEME.accent2;
        ctx.fillText(visible ? 'Hold it… measuring' : 'Show me your hand', 60, y + 80);
      },
      buttons: [{ id: 'calib-skip', label: 'Use typical range', size: 34 }], buttonH: 90,
    });
  }
  updateCalib(dt) {
    const f = this.feat;
    if (!f.valid) { this.calibT = Math.max(0, this.calibT - dt); }
    else {
      this.calibT += dt;
      if (this.calibT > 1.2) this.calibSamples.push(this.calibStep === 0 ? [f.grip, f.spread] : this.calibStep === 1 ? f.spread : f.grip);
    }
    if ((this._calibRedraw = (this._calibRedraw || 0) + dt) > 0.12) { this._calibRedraw = 0; this._calibPanel(); }
    if (this.calibT >= 3) {
      const s = this.calibSamples;
      if (this.calibStep === 0) { this.calibData.open = s.reduce((a, b) => a + b[0], 0) / s.length; this.calibData.restSpread = s.reduce((a, b) => a + b[1], 0) / s.length; }
      if (this.calibStep === 1) this.calibData.maxSpread = Math.max(...s);
      if (this.calibStep === 2) this.calibData.fist = Math.max(...s);
      this.sound.chime(this.calibStep * 2 + 2);
      this.calibStep++; this.calibT = 0; this.calibSamples = [];
      if (this.calibStep === 1) this.say('Now spread your fingers, only as far as is comfortable.');
      if (this.calibStep === 2) this.say('And a gentle fist. No pain, ever.');
      if (this.calibStep === 3) {
        const c = this.calibData;
        // guard against a range too small to measure
        if (c.fist - c.open < 0.08) c.fist = c.open + 0.08;
        if (c.maxSpread - c.restSpread < 0.1) c.maxSpread = c.restSpread + 0.1;
        this.profile.calib = c; this.profile.setupDone = true; store.save(this.profile);
        this.say('Got it. Every goal is now set to your own range.');
        this.startSession();
      } else this._calibPanel();
    }
  }

  startSession() {
    if (!this.profile.calib) return this.goCalib();
    this.session = { t0: performance.now(), reps: 0, plants: 0, per: {}, adapted: 0 };
    this.queue = ORDER.filter((id) => EXERCISES[id].reps[this.profile.length] > 0);
    this.exIndex = -1;
    this.nextExercise();
  }
  nextExercise() {
    this.disposeRunner();
    this.exIndex++;
    if (this.exIndex >= this.queue.length) return this.finishSession();
    const id = this.exId = this.queue[this.exIndex];
    const def = EXERCISES[id];
    this.state = 'intro'; this.introT = 0;
    this.show({
      kicker: `Exercise ${this.exIndex + 1} of ${this.queue.length} · ${def.goal}`, title: def.title, body: def.intro,
      buttons: [{ id: 'go', label: 'Start', primary: true }, { id: 'skip', label: 'Skip this one' }],
    });
    this.say(def.title + '. ' + def.intro);
  }
  beginExercise() {
    const id = this.exId;
    this.runner = createRunner(id, { profile: this.profile, world: this.world, side: this.sideSign() });
    this.state = 'exercise'; this.panel.visible = false; this.hud.visible = true; this.hudT = 1;
    this.exPeak = 0; this.lostT = 0;
    const cues = EXERCISES[id].cues;
    this.caption = cues ? cues[0] : EXERCISES[id].intro;
  }
  disposeRunner() { if (this.runner?.dispose) this.runner.dispose(); this.runner = null; this.highlights.forEach((h) => (h.visible = false)); }

  drawHud() {
    const r = this.runner, def = EXERCISES[this.exId];
    this.hud.set({
      bg: 'rgba(255,250,240,0.9)',
      custom: (ctx, W, H) => {
        ctx.fillStyle = THEME.ink; ctx.font = `800 44px ${FONT}`; ctx.fillText(def.title, 40, 64);
        ctx.fillStyle = THEME.soft; ctx.font = `600 32px ${FONT}`; wrap(ctx, this.caption, 40, 112, W - 330, 38);
        // rep dots
        for (let i = 0; i < r.reps; i++) {
          ctx.beginPath(); ctx.arc(52 + i * 40, H - 58, 13, 0, Math.PI * 2);
          ctx.fillStyle = i < r.count ? def.color : '#e6dccb'; ctx.fill();
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(36,51,42,0.25)'; ctx.stroke();
        }
        // live meter
        const mx = W - 290, mw = 30, mh = H - 70;
        ctx.fillStyle = '#ece3d1'; ctx.beginPath(); ctx.roundRect(mx, 36, mw, mh, 15); ctx.fill();
        const v = Math.max(0, Math.min(1, r.progress || 0));
        ctx.fillStyle = def.color; ctx.beginPath(); ctx.roundRect(mx, 36 + mh * (1 - v), mw, mh * v, 15); ctx.fill();
      },
      buttons: [{ id: 'pause', label: 'Pause', size: 36, rect: [1024 - 230, 40, 190, 335 - 80] }],
    });
  }

  updateExercise(dt) {
    const r = this.runner, f = this.feat, hand = this.measureHand();
    if (!f.valid) {
      this.lostT += dt;
      if (this.lostT > 3 && this.renderer.xr.isPresenting) return this.pause('Paused — I can’t see your hand. Bring it back into view whenever you’re ready.', true);
    } else this.lostT = 0;
    const ev = f.valid ? r.update(f, dt, hand) : [];
    r.visual?.(this.garden);
    if (r.raw && f.valid) this.exPeak = Math.max(this.exPeak, r.raw(f));
    for (const e of ev) {
      if (e === 'peak') { this.sound.chime(r.count + 2, 0.12); const c = EXERCISES[this.exId].cues; if (c) this.caption = c[1]; }
      if (e === 'rep') this.onRep();
      if (e === 'adapt') { this.session.adapted++; this.say('That’s your range today, and that’s perfect. I’ve moved the goal to meet you.'); }
    }
    // pinch target highlight
    if (r.highlight) {
      const H = [hand]; if (this.mirrorOn) H.push(this.mirror);
      this.highlights.forEach((m, i) => {
        const h = H[i >> 1]; m.visible = !!h && h.visible;
        if (m.visible) m.position.copy(h.joints[r.highlight[i & 1]]);
        m.scale.setScalar(1 + Math.sin(performance.now() / 180) * 0.15);
      });
    }
    if ((this.hudT += dt) > 0.08) { this.hudT = 0; this.drawHud(); }
    if (r.done) {
      this.disposeRunner();
      this.session.per[this.exId] = { reps: r.count, peak: this.exPeak, avgRep: r.repTimes.length ? r.repTimes.reduce((a, b) => a + b, 0) / r.repTimes.length : 0, adapted: r.adapted };
      this.sound.fanfare();
      this.state = 'celebrate'; this.celebrateT = 0;
      this.hud.visible = false;
      this.garden.sparkles.emit(new THREE.Vector3(0, BED.y + 0.2, BED.z), EXERCISES[this.exId].color, 80, 0.5);
      this.show({ kicker: 'Complete', title: `${EXERCISES[this.exId].title} — done!`, body: `${r.count} new ${VARIANTS[EXERCISES[this.exId].variant].name.toLowerCase()}${r.count > 1 ? 's' : ''} in your garden.`, buttons: [{ id: 'next', label: this.exIndex + 1 < this.queue.length ? 'Next' : 'Finish', primary: true }] });
      this.say(['Beautiful.', 'Well done.', 'Lovely work.'][this.exIndex % 3]);
    }
  }

  onRep() {
    const r = this.runner, def = EXERCISES[this.exId];
    this.session.reps++;
    this.sound.chime(r.count + 1);
    const hues = HUES[def.variant];
    const seed = Math.floor(Math.random() * 1e6);
    const hue = hues[Math.floor(Math.random() * hues.length)];
    const plant = this.garden.addPlant(def.variant, hue, seed);
    if (plant) { this.profile.plants.push([def.variant, hue, seed]); this.session.plants++; }
    const at = r.caughtAt ? this.world.worldToLocal(r.caughtAt.clone()) : (plant ? plant.pos.clone().add(new THREE.Vector3(0, 0.06, 0)) : new THREE.Vector3(0, BED.y + 0.15, BED.z));
    this.garden.sparkles.emit(at, def.color, 28);
    this.garden.pulseHero();
    const cues = def.cues;
    if (cues) this.caption = cues[0];
    if (r.count % 3 === 0 && !r.done) this.say(PRAISE[(r.count / 3 + this.exIndex) % PRAISE.length]);
    if (this.exId === 'pinch') this.caption = ['Index finger', 'Middle finger', 'Ring finger', 'Little finger'][r.finger] + ' next';
    if (this.exId === 'fireflies') this.caption = `${r.reps - r.count} fireflies left`;
  }

  pause(msg, auto = false) {
    this.pausedFrom = this.state; this.state = 'paused'; this.autoPaused = auto; this.pauseSeen = 0;
    this.show({ kicker: 'Paused', title: 'Take a breath', body: msg || 'Rest as long as you like. Your progress is safe.', buttons: [{ id: 'resume', label: 'Resume', primary: true }, { id: 'end', label: 'End session' }] });
    this.say(auto ? 'Paused. Show me your hand when you’re ready.' : 'Paused.', true);
  }
  resume() { this.state = this.pausedFrom; this.panel.visible = false; this.hud.visible = true; this.lostT = 0; }

  finishSession() {
    this.disposeRunner();
    const p = this.profile, s = this.session;
    const dur = (performance.now() - s.t0) / 1000;
    const prev = [...p.sessions].reverse().find((x) => x.metrics);
    const metrics = {
      grip: s.per.bloom ? Math.round(s.per.bloom.peak * 100) : null,
      spread: s.per.spread ? Math.round(s.per.spread.peak) : null,
      turn: s.per.turn ? Math.round(s.per.turn.peak) : null,
      pinch: s.per.pinch ? +s.per.pinch.avgRep.toFixed(1) : null,
      reach: s.per.fireflies ? +s.per.fireflies.avgRep.toFixed(1) : null,
    };
    // adaptive progression: the coach nudges each goal based on how today went
    const notes = [];
    for (const [id, x] of Object.entries(s.per)) {
      const before = p.level[id];
      if (x.adapted) p.level[id] = Math.max(0.3, before - 0.05);
      else if (x.avgRep < 6) p.level[id] = Math.min(0.95, before + 0.05);
      if (p.level[id] > before) notes.push(EXERCISES[id].title);
    }
    p.sessions.push({ day: store.dayKey(), t: Date.now(), dur: Math.round(dur), reps: s.reps, plants: s.plants, metrics, adapted: s.adapted });
    store.save(p);
    this.state = 'summary'; this.summaryT = 0;
    const lines = [];
    const cmp = (k, label, unit, higherBetter = true) => {
      if (metrics[k] == null) return;
      let t = `${label}: ${metrics[k]}${unit}`;
      if (prev?.metrics?.[k] != null) { const d = +(metrics[k] - prev.metrics[k]).toFixed(1); if (d) t += `  (${d > 0 ? '+' : ''}${d}${unit} ${(d > 0) === higherBetter ? '▲' : '▼'})`; }
      lines.push(t);
    };
    cmp('grip', 'Hand closure', '%'); cmp('spread', 'Finger spread', '°'); cmp('turn', 'Wrist turn', '°'); cmp('pinch', 'Seconds per pinch', 's', false);
    const st = store.streak(p);
    this.show({
      kicker: `Session complete · ${Math.round(dur / 60) || 1} min · ${st}-day streak`, title: `+${s.plants} plants today`, titleSize: 56,
      body: lines.join('\n') + (notes.length ? `\nNext time I’ll gently raise: ${notes.join(', ')}.` : ''), bodySize: 30,
      buttons: [{ id: 'progress', label: 'Progress' }, { id: 'home', label: 'Done', primary: true }],
    });
    this.sound.fanfare();
    this.say(`Session complete. You grew ${s.plants} plants today. See you tomorrow.`);
  }

  goProgress() {
    this.state = 'progress';
    const S = this.profile.sessions.filter((s) => s.metrics).slice(-14);
    this.show({
      kicker: `${this.profile.sessions.length} sessions · ${this.profile.plants.length} plants · ${store.streak(this.profile)}-day streak`, title: 'Your range over time', titleSize: 48,
      custom: (ctx, W, H, y) => {
        const x0 = 70, x1 = W - 70, y0 = y + 10, y1 = H - 235;
        ctx.strokeStyle = '#e2d8c5'; ctx.lineWidth = 2;
        for (let i = 0; i <= 4; i++) { const yy = y0 + (y1 - y0) * i / 4; ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke(); }
        if (S.length < 2) { ctx.fillStyle = THEME.soft; ctx.font = `600 32px ${FONT}`; ctx.fillText('Your chart appears after two sessions.', x0, (y0 + y1) / 2); return; }
        const series = [['grip', 'Closure %', '#e0607e', 100], ['spread', 'Spread °', '#3d8b5a', 70], ['turn', 'Turn °', '#e0a030', 180]];
        series.forEach(([k, label, color, max], si) => {
          ctx.strokeStyle = color; ctx.lineWidth = 7; ctx.lineJoin = 'round'; ctx.beginPath();
          let started = false;
          S.forEach((s, i) => { const v = s.metrics[k]; if (v == null) return; const x = x0 + (x1 - x0) * i / (S.length - 1), yy = y1 - (y1 - y0) * Math.min(1, v / max); started ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); started = true; });
          ctx.stroke();
          ctx.fillStyle = color; ctx.font = `800 28px ${FONT}`; ctx.fillText('● ' + label, x0 + si * 280, y1 + 42);
        });
      },
      buttons: [{ id: 'home', label: 'Back', primary: true }],
    });
  }

  goSettings() {
    this.state = 'settings';
    const p = this.profile;
    this.show({
      kicker: 'Settings', title: 'Make it yours', body: 'Everything stays on this headset. No account, no cloud.', bodySize: 30,
      buttons: [
        { id: 'set-hand', label: `Hand: ${p.hand}`, size: 34 }, { id: 'set-mirror', label: `Mirror: ${p.mirror ? 'on' : 'off'}`, size: 34 }, { id: 'set-len', label: `Length: ${p.length}`, size: 34 },
        { id: 'set-calib', label: 'Re-measure', size: 34 }, { id: 'set-voice', label: `Voice: ${this.sound.voice ? 'on' : 'off'}`, size: 34 }, { id: 'home', label: 'Done', primary: true, size: 34 },
      ], buttonH: 92,
    });
  }

  goAbout() {
    this.state = 'about';
    this.show({
      kicker: 'About & safety', title: 'Gentle by design', titleSize: 50, bodySize: 28,
      body: 'Tend is a wellness companion, not a medical device. Move only within a pain-free range and follow your therapist’s advice. Every goal adapts to your own measured range, and Tend lowers the goal if today is a harder day. Your data never leaves this headset. Tip: turn a photo of something you love into a 3D keepsake with Camera to 3D, then pinch it on your planter to pick it up.',
      buttons: [{ id: 'home', label: 'Back', primary: true }],
    });
  }

  onButton(id) {
    this.sound.start(); this.sound.tick();
    const p = this.profile;
    switch (id) {
      case 'start-setup': return this.goSetupHand();
      case 'about': return this.goAbout();
      case 'hand-left': case 'hand-right': case 'hand-both':
        p.hand = id.slice(5); store.save(p);
        return p.hand === 'both' ? (p.mirror = false, this.goSetupLength()) : this.goSetupMirror();
      case 'mirror-on': case 'mirror-off': p.mirror = id === 'mirror-on'; store.save(p); return this.goSetupLength();
      case 'len-quick': case 'len-full': p.length = id.slice(4); store.save(p); return this.goCalib();
      case 'calib-skip': p.calib = { open: 0.12, fist: 0.75, restSpread: 0.45, maxSpread: 0.85 }; p.setupDone = true; store.save(p); return this.startSession();
      case 'begin': return this.startSession();
      case 'go': return this.beginExercise();
      case 'skip': return this.nextExercise();
      case 'next': return this.nextExercise();
      case 'pause': return this.pause();
      case 'resume': return this.resume();
      case 'end': return this.session?.reps ? this.finishSession() : this.goWelcome();
      case 'progress': return this.goProgress();
      case 'settings': return this.goSettings();
      case 'home': return this.goWelcome();
      case 'set-hand': p.hand = { left: 'right', right: 'both', both: 'left' }[p.hand]; store.save(p); return this.goSettings();
      case 'set-mirror': p.mirror = !p.mirror; store.save(p); return this.goSettings();
      case 'set-len': p.length = p.length === 'quick' ? 'full' : 'quick'; store.save(p); return this.goSettings();
      case 'set-voice': this.sound.voice = !this.sound.voice; p.voice = this.sound.voice; store.save(p); return this.goSettings();
      case 'set-calib': return this.goCalib();
    }
  }

  // which button the autopilot should press in the current state
  autopilotButton() {
    const pick = { welcome: ['start-setup', 'begin'], setupHand: [this.profile.hand === 'left' ? 'hand-left' : 'hand-right'], setupMirror: [this.profile.mirror ? 'mirror-on' : 'mirror-off'], setupLength: ['len-full'], intro: ['go'], celebrate: ['next'], summary: ['progress'], progress: [] }[this.state];
    if (!pick) return null;
    if (this.state === 'intro' && this.introT < 2.5) return null;
    if (this.state === 'celebrate' && this.celebrateT < 1.8) return null;
    if (this.state === 'summary' && (this.summaryT || 0) < 5) return null;
    for (const id of pick) if (this.panel.buttons.some((b) => b.id === id)) return { panel: this.panel, id };
    return null;
  }

  // ---------------- frame ----------------
  loop(frame, fixedDt) {
    const dt = fixedDt ?? Math.min(0.05, this.clock.getDelta());
    const now = performance.now();
    const xr = this.renderer.xr.isPresenting;
    if (xr && frame) {
      if (this.needsRecenter && this.recenter()) this.needsRecenter = false;
      readXRHands(frame, this.renderer.xr.getReferenceSpace(), this.real, now);
    } else this.simHands.update(dt);

    const H = this.hands;
    const mh = this.measureHand();
    analyzeHand(H.left, this.feats.left); analyzeHand(H.right, this.feats.right);
    this.feat = this.feats[mh.handedness];

    // mirror therapy: reflect the healthy hand across the body midline
    if (this.mirrorOn) {
      const n = new THREE.Vector3(1, 0, 0).applyQuaternion(this.world.quaternion);
      mirrorHand(H[this.healthy], this.mirror, this.world.position, n);
    } else this.mirror.visible = false;
    this.views.left.update(this.mirrorOn && this.affected === 'left' ? { visible: false } : H.left);
    this.views.right.update(this.mirrorOn && this.affected === 'right' ? { visible: false } : H.right);
    this.views.mirror.update(this.mirror);

    // UI input: real index fingertips
    const tips = [H.left.visible ? H.left.joints[TIPS.index] : null, H.right.visible ? H.right.joints[TIPS.index] : null];
    this.input.update(tips, dt);

    switch (this.state) {
      case 'intro0': this.updateIntro(dt); break;
      case 'calib': this.updateCalib(dt); break;
      case 'exercise': this.updateExercise(dt); break;
      case 'intro': this.introT += dt; break;
      case 'celebrate': this.celebrateT += dt; break;
      case 'summary': this.summaryT = (this.summaryT || 0) + dt; break;
      case 'paused': if (this.autoPaused && this.feat.valid && (this.pauseSeen += dt) > 1.2) this.resume(); break;
    }
    if (this.state !== 'exercise' && this.state !== 'paused' && this.state !== 'intro0') this.garden.setHero({ open: 0.75 + Math.sin(now / 1400) * 0.1 });
    this.garden.update(dt, xr ? this.renderer.xr.getCamera() : this.camera);
    this.keepsakes.update(dt, H, this.feats, this.state !== 'exercise' && this.state !== 'calib');
    if (this.profile.plants.length !== this._savedPlants && this.state === 'exercise' && now - (this._lastSave || 0) > 4000) { this._lastSave = now; this._savedPlants = this.profile.plants.length; store.save(this.profile); }
    if (xr) { this.camera.layers.mask = 1 | (1 << 5); this.renderer.render(this.scene, this.camera); }
    else {
      // world through bloom + tone mapping, then UI on top at its true colours
      this.camera.layers.mask = 1; this.composer.render(dt);
      const r = this.renderer; r.autoClear = false; r.clearDepth(); this.camera.layers.mask = 1 << 5;
      r.render(this.scene, this.camera); r.autoClear = true; this.camera.layers.mask = 1;
    }
  }
}

window.app = new App();

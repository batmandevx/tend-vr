// Keepsakes: photograph a real object with Camera-to-3D (phone → textured 3D model),
// and it appears on the rim of your Tend planter. Pinch it to pick it up and turn it in your hand.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BED } from './garden.js';
import { TIPS } from './hands.js';

const DB = 'tend-keepsakes', STORE = 'items', MAX_SHOWN = 4, SIZE = 0.11;
const SERVER_KEY = 'tend.camera3d';

function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode), s = t.objectStore(STORE);
    const out = fn(s);
    t.oncomplete = () => res(out && 'result' in out ? out.result : undefined); t.onerror = () => rej(t.error);
  });
}

// slots on the near rim of the planter, within a seated arm's reach
function slotPos(i, out) {
  const a = [-1.05, 1.05, -1.6, 1.6][i];
  return out.set(Math.sin(a) * (BED.r + 0.06), BED.y + 0.01, BED.z + Math.cos(a) * (BED.r + 0.06));
}

export class Keepsakes {
  constructor(app) {
    this.app = app;
    this.items = []; // { id, name, group, model, home, grabbed }
    this.loader = new GLTFLoader();
    this.grab = null;
    this.onChange = () => {};
    const stoneMat = new THREE.MeshStandardMaterial({ color: '#d9d2c3', roughness: 0.9 });
    this.pedestals = [0, 1, 2, 3].map((i) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.03, 20), stoneMat);
      slotPos(i, m.position); m.position.y += 0.015; m.visible = false;
      app.world.add(m); return m;
    });
    this.restore();
  }

  get server() { return localStorage.getItem(SERVER_KEY) || ''; }
  set server(v) { localStorage.setItem(SERVER_KEY, v); }

  async restore() {
    try {
      const all = await tx('readonly', (s) => s.getAll());
      all.sort((a, b) => a.added - b.added);
      for (const rec of all.slice(-MAX_SHOWN)) await this._place(rec, false);
      this.onChange();
    } catch (e) { console.warn('keepsakes unavailable', e); }
  }

  async list() { try { return (await tx('readonly', (s) => s.getAll())).sort((a, b) => b.added - a.added); } catch { return []; } }

  // Add from a Blob/File (GLB). Returns the record.
  async add(blob, name, source = 'file') {
    const rec = { id: 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: (name || 'Keepsake').slice(0, 60), blob, source, added: Date.now() };
    await this._place(rec, true); // validate it loads before saving
    await tx('readwrite', (s) => s.put(rec));
    this.onChange();
    return rec;
  }

  async remove(id) {
    await tx('readwrite', (s) => s.delete(id));
    const i = this.items.findIndex((k) => k.id === id);
    if (i >= 0) { this.app.world.remove(this.items[i].group); this.items.splice(i, 1); this._relayout(); }
    this.onChange();
  }

  // ---- Camera-to-3D server ----
  async fetchScans(base) {
    base = base.replace(/\/+$/, '');
    const r = await fetch(base + '/scans');
    if (!r.ok) throw new Error('Server answered ' + r.status);
    const { scans } = await r.json();
    return scans.filter((s) => s.status === 'ready' && s.model_url).map((s) => ({
      id: s.id, name: s.name || 'Scan', thumb: s.thumb_url ? base + s.thumb_url : null,
      glb: base + '/scans/' + encodeURIComponent(s.id) + '/export/glb',
    }));
  }
  async importScan(scan) {
    const r = await fetch(scan.glb);
    if (!r.ok) throw new Error('Could not download model (' + r.status + ')');
    return this.add(await r.blob(), scan.name, 'camera-to-3d');
  }

  async _place(rec, celebrate) {
    const url = URL.createObjectURL(rec.blob);
    let gltf;
    try { gltf = await this.loader.loadAsync(url); } finally { URL.revokeObjectURL(url); }
    const model = gltf.scene;
    // normalise: centre, sit on its base, fit inside SIZE
    const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3());
    const s = SIZE / Math.max(size.x, size.y, size.z, 1e-6);
    model.scale.setScalar(s);
    const c = box.getCenter(new THREE.Vector3());
    model.position.set(-c.x * s, -box.min.y * s, -c.z * s);
    model.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; if (o.material) o.material.side = THREE.FrontSide; } });
    const group = new THREE.Group(); group.add(model);
    this.app.world.add(group);
    if (this.items.length >= MAX_SHOWN) { const old = this.items.shift(); this.app.world.remove(old.group); }
    const item = { id: rec.id, name: rec.name, group, home: new THREE.Vector3(), homeQ: new THREE.Quaternion(), grow: celebrate ? 0 : 1 };
    this.items.push(item);
    this._relayout();
    if (celebrate) { this.app.garden.sparkles.emit(item.home.clone().add(new THREE.Vector3(0, 0.07, 0)), '#ffd6a5', 70, 0.4); this.app.sound.fanfare(); }
    return item;
  }
  _relayout() {
    this.pedestals.forEach((p, i) => (p.visible = i < this.items.length));
    this.items.forEach((k, i) => {
      slotPos(i, k.home); k.home.y += 0.03;
      // face the user
      k.homeQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-k.home.x, -(k.home.z)) + Math.PI);
      if (k !== this.grab?.item) { k.group.position.copy(k.home); k.group.quaternion.copy(k.homeQ); }
    });
  }

  // Pinch near a keepsake to pick it up; it follows your hand's position and rotation.
  update(dt, hands, feats, allowGrab = true) {
    const t = performance.now() / 1000;
    for (const k of this.items) {
      if (k.grow < 1) { k.grow = Math.min(1, k.grow + dt / 1.2); const e = 1 - Math.pow(1 - k.grow, 3); k.group.scale.setScalar(Math.max(0.001, e)); }
      if (this.grab?.item === k) continue;
      // drift home, then idle spin
      k.group.position.lerp(k.home, Math.min(1, dt * 4));
      k.group.rotateY(dt * 0.25);
      k.group.position.y = THREE.MathUtils.lerp(k.group.position.y, k.home.y + Math.sin(t * 1.2 + k.home.x * 9) * 0.004, 0.2);
    }
    const W = this.app.world;
    if (this.grab) {
      const { hand, f, item } = this.grab;
      if (!hand.visible || f.pinch[0] > 0.42) { this.grab = null; this.app.sound.chime(2, 0.12); return; }
      const p = W.worldToLocal(f.pinchPoint.clone());
      const q = this._handQ(hand);
      item.group.position.lerp(p.add(this.grab.offset.clone().applyQuaternion(q)), 0.5);
      item.group.quaternion.copy(q).multiply(this.grab.rel);
      return;
    }
    if (!allowGrab) return;
    for (const side of ['left', 'right']) {
      const hand = hands[side], f = feats[side];
      if (!hand.visible || !f.valid || f.pinch[0] > 0.3) continue;
      const pl = W.worldToLocal(f.pinchPoint.clone());
      for (const k of this.items) {
        const center = k.group.position.clone().add(new THREE.Vector3(0, SIZE * 0.45, 0));
        if (center.distanceTo(pl) < SIZE * 0.75) {
          const q = this._handQ(hand), qi = q.clone().invert();
          this.grab = { hand, f, item: k, rel: qi.clone().multiply(k.group.quaternion), offset: k.group.position.clone().sub(pl).applyQuaternion(qi) };
          this.app.sound.chime(5, 0.15);
          return;
        }
      }
    }
  }
  _handQ(hand) {
    // orthonormal frame from wrist → middle knuckle and wrist → index knuckle, in world-local space
    const W = this.app.world, j = hand.joints;
    const w = W.worldToLocal(j[0].clone()), m = W.worldToLocal(j[11].clone()), i = W.worldToLocal(j[6].clone());
    const z = w.clone().sub(m).normalize(), x = i.clone().sub(w).normalize();
    const y = new THREE.Vector3().crossVectors(z, x).normalize(); x.crossVectors(y, z);
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  }
}

// ---------- 2D drawer (outside VR): connect to Camera-to-3D or drop a .glb ----------
export function mountDrawer(ks) {
  const el = document.getElementById('keepsakes');
  const toggle = document.getElementById('ks-toggle');
  const list = el.querySelector('.ks-mine'), scans = el.querySelector('.ks-scans'), status = el.querySelector('.ks-status');
  const input = el.querySelector('input[type=url]'), file = el.querySelector('input[type=file]');
  input.value = ks.server || new URLSearchParams(location.search).get('camera3d') || (location.protocol === 'https:' ? 'https://' : 'http://localhost:8000');
  const say = (t, bad) => { status.textContent = t; status.classList.toggle('bad', !!bad); };
  toggle.onclick = () => { el.hidden = !el.hidden; if (!el.hidden) renderMine(); };
  el.querySelector('.ks-close').onclick = () => (el.hidden = true);

  async function renderMine() {
    const all = await ks.list();
    list.innerHTML = all.length ? '' : '<p class="ks-empty">No keepsakes yet.</p>';
    for (const r of all) {
      const row = document.createElement('div'); row.className = 'ks-row';
      row.innerHTML = `<span>🪴 ${escapeHtml(r.name)}</span><button title="Remove">✕</button>`;
      row.querySelector('button').onclick = async () => { await ks.remove(r.id); renderMine(); };
      list.appendChild(row);
    }
  }
  ks.onChange = () => { if (!el.hidden) renderMine(); };

  el.querySelector('.ks-connect').onclick = async () => {
    const base = input.value.trim(); if (!base) return;
    say('Connecting…'); scans.innerHTML = '';
    try {
      const items = await ks.fetchScans(base);
      ks.server = base;
      say(items.length ? `${items.length} model${items.length > 1 ? 's' : ''} ready — tap one to plant it.` : 'Connected. No finished scans yet — take a photo in Camera to 3D first.');
      for (const s of items) {
        const b = document.createElement('button'); b.className = 'ks-scan';
        b.innerHTML = (s.thumb ? `<img src="${s.thumb}" alt="">` : '<div class="ks-noimg">🧊</div>') + `<span>${escapeHtml(s.name)}</span>`;
        b.onclick = async () => {
          b.disabled = true; say(`Bringing “${s.name}” into your garden…`);
          try { await ks.importScan(s); say(`“${s.name}” is now on your planter.`); renderMine(); } catch (e) { say(e.message, true); b.disabled = false; }
        };
        scans.appendChild(b);
      }
    } catch (e) {
      say(location.protocol === 'https:' && base.startsWith('https://')
        ? 'Could not reach the server. Open that address once in this browser and accept its certificate, then try again.'
        : 'Could not reach the server: ' + e.message, true);
    }
  };
  const addFile = async (f) => {
    if (!f) return;
    if (!/\.glb$/i.test(f.name)) return say('Please choose a .glb file.', true);
    say(`Planting “${f.name}”…`);
    try { await ks.add(f, f.name.replace(/\.glb$/i, '').replace(/[_-]+/g, ' ').trim()); say('Added to your planter.'); renderMine(); } catch (e) { say('That file could not be read as a 3D model.', true); }
  };
  file.onchange = () => addFile(file.files[0]);
  addEventListener('dragover', (e) => e.preventDefault());
  addEventListener('drop', (e) => { e.preventDefault(); addFile(e.dataTransfer.files[0]); });
  if (new URLSearchParams(location.search).has('camera3d')) { el.hidden = false; renderMine(); el.querySelector('.ks-connect').click(); }
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

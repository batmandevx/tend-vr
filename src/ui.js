// World-space canvas panels with big, forgiving buttons.
// Buttons can be poked with a fingertip, activated by hovering a fingertip (dwell — for limited mobility),
// or clicked with a mouse on desktop.
import * as THREE from 'three';

const FONT = '"Nunito", "Segoe UI", system-ui, -apple-system, sans-serif';
export const THEME = { bg: 'rgba(255,250,240,0.94)', ink: '#24332a', soft: '#5d6f62', accent: '#3d8b5a', accent2: '#e07a5f', gold: '#f2b84b' };

function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

export function wrap(ctx, text, x, y, maxW, lh) {
  const paras = String(text).split('\n');
  for (const para of paras) {
    const words = para.split(' ');
    let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y); y += lh; line = w; } else line = t;
    }
    ctx.fillText(line, x, y); y += lh;
  }
  return y;
}

export class Panel {
  constructor(w, h, px = 1024) {
    this.w = w; this.h = h;
    this.canvas = document.createElement('canvas');
    this.canvas.width = px; this.canvas.height = Math.round(px * h / w);
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, toneMapped: false, depthWrite: false }));
    this.mesh.renderOrder = 10;
    this.mesh.userData.panel = this;
    this.buttons = [];
    this.state = null;
    this.hover = null; this.dwell = 0;
    this.dirty = true;
  }
  get visible() { return this.mesh.visible; }
  set visible(v) { this.mesh.visible = v; }

  set(state) { this.state = state; this.hover = null; this.dwell = 0; this.dirty = true; this.draw(); }

  draw() {
    const s = this.state; if (!s) return;
    const { ctx, canvas } = this; const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = s.bg || THEME.bg; rr(ctx, 4, 4, W - 8, H - 8, 44); ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(61,139,90,0.35)'; ctx.stroke();
    let y = 92;
    ctx.textBaseline = 'alphabetic';
    if (s.kicker) { ctx.fillStyle = THEME.accent; ctx.font = `800 30px ${FONT}`; ctx.fillText(s.kicker.toUpperCase(), 60, 66); y = 122; }
    if (s.title) { ctx.fillStyle = THEME.ink; ctx.font = `800 ${s.titleSize || 60}px ${FONT}`; y = wrap(ctx, s.title, 60, y, W - 120, (s.titleSize || 60) * 1.12) + 6; }
    if (s.body) { ctx.fillStyle = THEME.soft; ctx.font = `600 ${s.bodySize || 36}px ${FONT}`; y = wrap(ctx, s.body, 60, y + 4, W - 120, (s.bodySize || 36) * 1.3); }
    if (s.custom) y = s.custom(ctx, W, H, y) ?? y;

    // buttons
    this.buttons = [];
    const btns = s.buttons || [];
    if (btns.length) {
      const perRow = btns.length > 3 ? Math.ceil(btns.length / 2) : btns.length;
      const rows = Math.ceil(btns.length / perRow);
      const bh = s.buttonH || 110, gap = 26;
      const bw = (W - 120 - gap * (perRow - 1)) / perRow;
      btns.forEach((b, i) => {
        const r = Math.floor(i / perRow), c = i % perRow;
        let bx = 60 + c * (bw + gap), by = H - 50 - (rows - r) * bh - (rows - r - 1) * gap, bW = bw, bH = bh;
        if (b.rect) [bx, by, bW, bH] = b.rect;
        this.buttons.push({ ...b, x: bx, y: by, w: bW, h: bH });
        const hov = this.hover === b.id;
        ctx.fillStyle = b.primary ? (hov ? '#2f7a4b' : THEME.accent) : (hov ? '#efe6d4' : '#f6efe1');
        rr(ctx, bx, by, bW, bH, 30); ctx.fill();
        ctx.lineWidth = hov ? 8 : 4; ctx.strokeStyle = b.primary ? '#24613b' : 'rgba(36,51,42,0.25)'; ctx.stroke();
        if (hov && this.dwell > 0) { // dwell progress bar
          ctx.fillStyle = b.primary ? 'rgba(255,255,255,0.35)' : 'rgba(61,139,90,0.3)';
          rr(ctx, bx, by, bW * Math.min(1, this.dwell), bH, 30); ctx.fill();
        }
        ctx.fillStyle = b.primary ? '#fff' : THEME.ink;
        ctx.font = `800 ${b.size || 42}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(b.label, bx + bW / 2, by + bH / 2 + 2);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      });
    }
    this.tex.needsUpdate = true;
    this.dirty = false;
  }

  // uv in [0,1] -> button
  buttonAtUV(u, v) {
    const x = u * this.canvas.width, y = (1 - v) * this.canvas.height;
    return this.buttons.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) || null;
  }
  buttonAtLocal(p) { return this.buttonAtUV(p.x / this.w + 0.5, p.y / this.h + 0.5); }
}

// Handles poke + dwell for any number of fingertips against a set of panels.
export class PanelInput {
  constructor(onPress) {
    this.onPress = onPress;
    this.panels = [];
    this.prevDepth = new Map();
    this.cooldown = 0;
    this.local = new THREE.Vector3();
    this.dwellTime = 1.3;
  }
  add(p) { this.panels.push(p); }
  update(tips, dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    for (const panel of this.panels) {
      if (!panel.visible || !panel.buttons.length) continue;
      let best = null, bestDepth = 1;
      tips.forEach((tip, ti) => {
        if (!tip) return;
        this.local.copy(tip); panel.mesh.worldToLocal(this.local);
        const btn = panel.buttonAtLocal(this.local);
        const depth = this.local.z;
        const key = panel.mesh.id + ':' + ti;
        const prev = this.prevDepth.get(key);
        this.prevDepth.set(key, depth);
        if (!btn || depth > 0.08 || depth < -0.06) return;
        // poke: fingertip crosses the panel plane from the front
        if (prev !== undefined && prev > 0.004 && depth <= 0.004 && this.cooldown <= 0) { this.press(panel, btn); return; }
        if (depth < bestDepth) { bestDepth = depth; best = btn; }
      });
      const id = best ? best.id : null;
      if (id !== panel.hover) { panel.hover = id; panel.dwell = 0; panel.draw(); }
      else if (id) {
        panel.dwell += dt / this.dwellTime;
        if (Math.floor(panel.dwell * 20) !== Math.floor((panel.dwell - dt / this.dwellTime) * 20)) panel.draw();
        if (panel.dwell >= 1 && this.cooldown <= 0) this.press(panel, best);
      }
    }
  }
  press(panel, btn) {
    this.cooldown = 0.6;
    panel.dwell = 0; panel.hover = null;
    this.onPress(btn.id, panel);
  }
}

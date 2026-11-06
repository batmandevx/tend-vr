// Procedural audio (no assets): pentatonic chimes, soft ambient bed, and a spoken + captioned coach.
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

export class Sound {
  constructor() { this.ctx = null; this.muted = false; this.voice = true; }
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.6; this.master.connect(this.ctx.destination);
    this._ambient();
  }
  _ambient() {
    const c = this.ctx, len = c.sampleRate * 4, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3; }
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const g = c.createGain(); g.gain.value = 0.05;
    src.connect(f).connect(g).connect(this.master); src.start();
    // soft pad
    [196, 246.94, 293.66].forEach((hz, i) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = hz;
      const og = c.createGain(); og.gain.value = 0.012;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.07 + i * 0.03; const lg = c.createGain(); lg.gain.value = 0.008;
      lfo.connect(lg).connect(og.gain); o.connect(og).connect(this.master); o.start(); lfo.start();
    });
  }
  chime(step = 0, vol = 0.25) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const hz = 392 * Math.pow(2, PENTA[step % PENTA.length] / 12);
    for (const [mult, type, v] of [[1, 'sine', 1], [2, 'triangle', 0.25], [3.01, 'sine', 0.1]]) {
      const o = c.createOscillator(); o.type = type; o.frequency.value = hz * mult;
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol * v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      o.connect(g).connect(this.master); o.start(t); o.stop(t + 1.7);
    }
  }
  tick() { if (!this.ctx || this.muted) return; const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain(); o.frequency.value = 880; g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08); o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.1); }
  fanfare() { [0, 2, 4, 7].forEach((s, i) => setTimeout(() => this.chime(s + 3, 0.22), i * 140)); }
  say(text) {
    if (!this.voice || this.muted || !('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text); u.rate = 0.95; u.pitch = 1.05; u.volume = 0.9;
      speechSynthesis.speak(u);
    } catch (e) { /* speech is optional */ }
  }
}

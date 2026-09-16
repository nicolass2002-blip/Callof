// Fully procedural sound: no asset files, everything synthesised on the fly.
// Distance attenuation + stereo panning are computed against the listener.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.7;
    this.noise = null;
    this.listener = { x: 0, z: 0, fx: 0, fz: -1 };
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 8;
    this.master.connect(comp).connect(this.ctx.destination);

    // One shared noise buffer, re-used by every noisy voice.
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
  }

  resume() { this.ctx?.resume?.(); }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  setListener(pos, fwd) {
    this.listener.x = pos.x; this.listener.z = pos.z;
    this.listener.fx = fwd.x; this.listener.fz = fwd.z;
  }

  /** Returns a gain node already panned/attenuated for a world position. */
  _bus(at, gain = 1, maxDist = 90) {
    const g = this.ctx.createGain();
    if (!at) {
      g.gain.value = gain;
      g.connect(this.master);
      return { node: g, gain };
    }
    const dx = at.x - this.listener.x, dz = at.z - this.listener.z;
    const dist = Math.hypot(dx, dz);
    const att = Math.max(0, 1 - dist / maxDist) ** 1.7;
    if (att <= 0.001) return null;
    // right vector = (-fz, fx)
    const rx = -this.listener.fz, rz = this.listener.fx;
    const pan = dist > 0.2 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / dist)) : 0;
    g.gain.value = gain * att;
    const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (p) { p.pan.value = pan * 0.85; g.connect(p).connect(this.master); }
    else g.connect(this.master);
    return { node: g, gain: g.gain.value, dist };
  }

  _noiseSrc(rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.playbackRate.value = rate;
    s.start(this.ctx.currentTime + Math.random() * 0.02);
    return s;
  }

  /** Gunshot: noise crack through a swept band-pass + low-end thump. */
  shot(kind = 'rifle', at = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const P = {
      rifle:   { g: 0.55, dur: 0.30, f0: 2600, f1: 380, q: 1.1, thump: 96 },
      smg:     { g: 0.42, dur: 0.20, f0: 3200, f1: 520, q: 1.3, thump: 118 },
      pistol:  { g: 0.40, dur: 0.22, f0: 2900, f1: 460, q: 1.2, thump: 130 },
      shotgun: { g: 0.70, dur: 0.44, f0: 1700, f1: 200, q: 0.8, thump: 66 },
      sniper:  { g: 0.85, dur: 0.60, f0: 1500, f1: 160, q: 0.7, thump: 54 },
    }[kind] || {};
    const bus = this._bus(at, P.g, 140);
    if (!bus) return;

    const src = this._noiseSrc(1);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = P.q;
    bp.frequency.setValueAtTime(P.f0, t);
    bp.frequency.exponentialRampToValueAtTime(P.f1, t + P.dur);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(1, t);
    env.gain.exponentialRampToValueAtTime(0.0008, t + P.dur);
    src.connect(bp).connect(env).connect(bus.node);
    src.stop(t + P.dur + 0.05);

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(P.thump, t);
    osc.frequency.exponentialRampToValueAtTime(P.thump * 0.45, t + 0.12);
    const oe = this.ctx.createGain();
    oe.gain.setValueAtTime(0.9, t);
    oe.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(oe).connect(bus.node);
    osc.start(t); osc.stop(t + 0.18);

    // Slap-back off the houses, only for far-away shots.
    if (bus.dist > 6) {
      const tail = this._noiseSrc(0.6);
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 900;
      const te = this.ctx.createGain();
      const d = 0.04 + Math.min(0.12, bus.dist / 900);
      te.gain.setValueAtTime(0, t + d);
      te.gain.linearRampToValueAtTime(0.22, t + d + 0.02);
      te.gain.exponentialRampToValueAtTime(0.001, t + d + 0.42);
      tail.connect(lp).connect(te).connect(bus.node);
      tail.stop(t + d + 0.45);
    }
  }

  impact(at, material = 'concrete') {
    if (!this.ctx) return;
    const bus = this._bus(at, 0.30, 55);
    if (!bus) return;
    const t = this.ctx.currentTime;
    const f = { concrete: 1800, wood: 900, metal: 3400, dirt: 520, glass: 5200, flesh: 420 }[material] ?? 1500;
    const src = this._noiseSrc(1.4);
    const bp = this.ctx.createBiquadFilter();
    bp.type = material === 'metal' ? 'bandpass' : 'lowpass';
    bp.frequency.setValueAtTime(f, t);
    bp.Q.value = material === 'metal' ? 6 : 1;
    const env = this.ctx.createGain();
    const dur = material === 'metal' ? 0.24 : 0.09;
    env.gain.setValueAtTime(0.9, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(bp).connect(env).connect(bus.node);
    src.stop(t + dur + 0.02);
  }

  /** Short mechanical click — used for reload steps, weapon swaps, dry fire. */
  click(freq = 1600, gain = 0.3, dur = 0.05, at = null) {
    if (!this.ctx) return;
    const bus = this._bus(at, gain, 30);
    if (!bus) return;
    const t = this.ctx.currentTime;
    const src = this._noiseSrc(1.8);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 3;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.9, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(bp).connect(env).connect(bus.node);
    src.stop(t + dur + 0.02);
  }

  reload(step = 0, at = null) {
    const seq = [[900, 0.26], [1500, 0.22], [2400, 0.3]];
    const [f, g] = seq[step % seq.length];
    this.click(f, g, 0.07, at);
  }

  step(at, running = false) {
    if (!this.ctx) return;
    const bus = this._bus(at, running ? 0.2 : 0.11, 26);
    if (!bus) return;
    const t = this.ctx.currentTime;
    const src = this._noiseSrc(0.8 + Math.random() * 0.3);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 700 + Math.random() * 300;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.8, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    src.connect(lp).connect(env).connect(bus.node);
    src.stop(t + 0.12);
  }

  /** UI ping when you land a shot. */
  hitmarker(kill = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = kill ? 1180 : 1750;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(kill ? 0.14 : 0.075, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (kill ? 0.16 : 0.06));
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.18);
    if (kill) {
      const o2 = this.ctx.createOscillator();
      o2.type = 'square'; o2.frequency.value = 1580;
      const g2 = this.ctx.createGain();
      g2.gain.setValueAtTime(0, t + 0.07);
      g2.gain.linearRampToValueAtTime(0.12, t + 0.09);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
      o2.connect(g2).connect(this.master);
      o2.start(t + 0.07); o2.stop(t + 0.28);
    }
  }

  explosion(at) {
    if (!this.ctx) return;
    const bus = this._bus(at, 1.0, 160);
    if (!bus) return;
    const t = this.ctx.currentTime;
    const src = this._noiseSrc(0.55);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2400, t);
    lp.frequency.exponentialRampToValueAtTime(160, t + 1.1);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(1, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    src.connect(lp).connect(env).connect(bus.node);
    src.stop(t + 1.25);

    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(74, t);
    sub.frequency.exponentialRampToValueAtTime(26, t + 0.6);
    const se = this.ctx.createGain();
    se.gain.setValueAtTime(1.1, t);
    se.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    sub.connect(se).connect(bus.node);
    sub.start(t); sub.stop(t + 0.75);
  }

  /** Supersonic crack of a round passing close by. */
  whiz(at) {
    if (!this.ctx) return;
    const bus = this._bus(at, 0.3, 14);
    if (!bus) return;
    const t = this.ctx.currentTime;
    const src = this._noiseSrc(2);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 7;
    bp.frequency.setValueAtTime(3600, t);
    bp.frequency.exponentialRampToValueAtTime(900, t + 0.13);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.8, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    src.connect(bp).connect(env).connect(bus.node);
    src.stop(t + 0.16);
  }

  pain() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this._noiseSrc(0.5);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 300; bp.Q.value = 1.4;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    src.connect(bp).connect(g).connect(this.master);
    src.stop(t + 0.32);
  }

  /**
   * Positioned looping voice (helicopter rotor, desert wind).
   * Returns a handle: {setPosition, setGain, stop}.
   */
  startLoop(kind) {
    if (!this.ctx) return { setPosition() {}, setGain() {}, stop() {} };
    const t = this.ctx.currentTime;
    const out = this.ctx.createGain();
    out.gain.value = 0;
    const pan = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (pan) out.connect(pan).connect(this.master);
    else out.connect(this.master);

    const parts = [];
    if (kind === 'rotor') {
      // blade slap: band-passed noise chopped by a saw LFO, plus a low thump
      const src = this._noiseSrc(1);
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 260; bp.Q.value = 1.1;
      const chop = this.ctx.createGain();
      chop.gain.value = 0.35;
      const lfo = this.ctx.createOscillator();
      lfo.type = 'sawtooth'; lfo.frequency.value = 12.5;
      const lfoAmt = this.ctx.createGain();
      lfoAmt.gain.value = 0.6;
      lfo.connect(lfoAmt).connect(chop.gain);
      lfo.start(t);
      src.connect(bp).connect(chop).connect(out);

      const thump = this.ctx.createOscillator();
      thump.type = 'sine'; thump.frequency.value = 58;
      const tg = this.ctx.createGain();
      tg.gain.value = 0.18;
      const lfo2 = this.ctx.createOscillator();
      lfo2.type = 'sine'; lfo2.frequency.value = 12.5;
      const lfo2Amt = this.ctx.createGain();
      lfo2Amt.gain.value = 0.16;
      lfo2.connect(lfo2Amt).connect(tg.gain);
      lfo2.start(t);
      thump.connect(tg).connect(out);
      thump.start(t);
      parts.push(src, lfo, lfo2, thump);
    } else {                                    // wind
      const src = this._noiseSrc(0.35);
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 480;
      const g = this.ctx.createGain();
      g.gain.value = 0.5;
      const lfo = this.ctx.createOscillator();
      lfo.type = 'sine'; lfo.frequency.value = 0.09;
      const amt = this.ctx.createGain();
      amt.gain.value = 0.32;
      lfo.connect(amt).connect(g.gain);
      lfo.start(t);
      src.connect(lp).connect(g).connect(out);
      parts.push(src, lfo);
    }

    const handle = {
      setGain: (v, ramp = 0.25) => {
        const now = this.ctx.currentTime;
        out.gain.cancelScheduledValues(now);
        out.gain.setTargetAtTime(Math.max(0, v), now, ramp);
      },
      setPosition: (at, maxDist = 120) => {
        const dx = at.x - this.listener.x, dz = at.z - this.listener.z;
        const dist = Math.hypot(dx, dz);
        const att = Math.max(0, 1 - dist / maxDist) ** 1.4;
        handle.setGain(att * (kind === 'rotor' ? 0.85 : 0.3), 0.12);
        if (pan && dist > 0.3) {
          const rx = -this.listener.fz, rz = this.listener.fx;
          pan.pan.value = Math.max(-1, Math.min(1, ((dx * rx + dz * rz) / dist) * 0.8));
        }
      },
      stop: () => {
        handle.setGain(0, 0.12);
        setTimeout(() => {
          for (const p of parts) { try { p.stop(); } catch { /* already stopped */ } }
          try { out.disconnect(); } catch { /* already gone */ }
        }, 500);
      },
    };
    return handle;
  }

  /** Muffle everything for a moment (flashbang) and ring the ears. */
  duck(duration = 3, depth = 0.22) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = this.master.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(this.volume, t);
    g.linearRampToValueAtTime(this.volume * depth, t + 0.06);
    g.linearRampToValueAtTime(this.volume, t + duration);

    const ring = this.ctx.createOscillator();
    ring.type = 'sine';
    ring.frequency.value = 3400;
    const rg = this.ctx.createGain();
    rg.gain.setValueAtTime(0, t);
    rg.gain.linearRampToValueAtTime(0.07, t + 0.08);
    rg.gain.exponentialRampToValueAtTime(0.0005, t + duration);
    ring.connect(rg).connect(this.ctx.destination);
    ring.start(t); ring.stop(t + duration + 0.1);
  }

  /** Incoming shell whistle. */
  whistle(at, dur = 1.2) {
    if (!this.ctx) return;
    const bus = this._bus(at, 0.5, 200);
    if (!bus) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(1500, t);
    o.frequency.exponentialRampToValueAtTime(380, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0008, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + dur * 0.85);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(bus.node);
    o.start(t); o.stop(t + dur + 0.05);
  }

  /** Flashbang bang: very short, very loud, mostly high end. */
  flashbang(at) {
    if (!this.ctx) return;
    const bus = this._bus(at, 0.9, 150);
    if (!bus) return;
    const t = this.ctx.currentTime;
    const src = this._noiseSrc(1.6);
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 900;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(1, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(hp).connect(env).connect(bus.node);
    src.stop(t + 0.4);
  }

  /** Knife swing. */
  swing(at) {
    if (!this.ctx) return;
    const bus = this._bus(at, 0.3, 24);
    if (!bus) return;
    const t = this.ctx.currentTime;
    const src = this._noiseSrc(1.2);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 1.6;
    bp.frequency.setValueAtTime(700, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.16);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.connect(bp).connect(g).connect(bus.node);
    src.stop(t + 0.2);
  }

  /** Match-start / match-end siren of the test site. */
  siren(up = true) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(up ? 220 : 520, t);
    o.frequency.linearRampToValueAtTime(up ? 520 : 150, t + 1.6);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1400;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.25);
    g.gain.linearRampToValueAtTime(0, t + 1.9);
    o.connect(lp).connect(g).connect(this.master);
    o.start(t); o.stop(t + 2);
  }
}

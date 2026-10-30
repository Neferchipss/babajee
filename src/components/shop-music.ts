"use client";

// The shop's soundtrack, made live in the browser (no audio file): a slow
// lo-fi groove in D. Tanpura plucks hold the drone, an electric piano plays
// four chords, a round bass, soft drums with a lazy swing, vinyl crackle,
// and now and then a flute drifts over the top. It plays only inside the 3D
// shop: the scene says how far in you are (want), and it fades with that.
//
// Browsers only let sound start from a tap or a key, so unlock() is called
// on the visitor's first one; until then the music waits.

const BPM = 76;
const STEP = 60 / BPM / 4; // a sixteenth
const SWING = 0.2; // the off sixteenths come this share of a step late
const LOOK = 0.16; // seconds scheduled ahead

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

// D dorian: Dm9, Em7, Fmaj9, Em7, with the bass on each root
const CHORDS = [
  [50, 53, 57, 60, 64],
  [52, 55, 59, 62, 66],
  [53, 57, 60, 64, 67],
  [52, 55, 59, 62, 64],
];
const ROOTS = [38, 40, 41, 40];
// the tanpura: Pa, Sa, Sa, low Sa, once a bar
const TANPURA: [number, number][] = [
  [0, 45],
  [4, 50],
  [8, 50],
  [12, 38],
];
const FLUTE = [62, 65, 67, 69, 72, 74, 77]; // D minor pentatonic, up high

// sound on or off, kept on this device
const KEY = "bj-sound";
const listeners = new Set<() => void>();
export const soundPref = {
  get(): boolean {
    try {
      return localStorage.getItem(KEY) !== "off";
    } catch {
      return true;
    }
  },
  set(on: boolean) {
    try {
      localStorage.setItem(KEY, on ? "on" : "off");
    } catch {}
    listeners.forEach((f) => f());
  },
  subscribe(f: () => void) {
    listeners.add(f);
    return () => listeners.delete(f);
  },
};

export type ShopMusic = {
  // 0 = silent, 1 = all the way in; called every frame
  want(level: number): void;
  // from inside a tap or key press: allowed to start
  unlock(): void;
  // true while it should be playing but the browser hasn't allowed it yet
  blocked(): boolean;
  dispose(): void;
};

export function createShopMusic(): ShopMusic {
  let ctx: AudioContext | null = null;
  let master: GainNode;
  let bus: GainNode; // everything but the crackle, through the haze filter
  let keys: GainNode; // the piano, with its tremolo
  let wet: GainNode; // send to the reverb
  let echo: GainNode; // send to the delay
  let noise: AudioBuffer;
  let crackle: AudioBufferSourceNode | null = null;
  let timer = 0;
  let next = 0; // when the next step plays
  let step = 0; // sixteenths since the start
  let level = 0;
  let quietSince = 0;
  let disposed = false;
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  function build() {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const c = new AC();
    ctx = c;
    master = c.createGain();
    master.gain.value = 0;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    master.connect(comp).connect(c.destination);

    // the haze: a low-pass that breathes open and shut over half a minute
    const haze = c.createBiquadFilter();
    haze.type = "lowpass";
    haze.frequency.value = 2200;
    haze.Q.value = 0.6;
    const hazeLfo = c.createOscillator();
    hazeLfo.frequency.value = 1 / 32;
    const hazeAmt = c.createGain();
    hazeAmt.gain.value = 1100;
    hazeLfo.connect(hazeAmt).connect(haze.frequency);
    hazeLfo.start();
    bus = c.createGain();
    bus.connect(haze).connect(master);

    // a long soft room, from decaying noise
    const verb = c.createConvolver();
    const len = Math.round(c.sampleRate * 3.4);
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    verb.buffer = ir;
    wet = c.createGain();
    wet.gain.value = 0.9;
    const verbOut = c.createGain();
    verbOut.gain.value = 0.32;
    wet.connect(verb).connect(verbOut).connect(bus);

    // a dotted-eighth echo, darker each time round
    const delay = c.createDelay(2);
    delay.delayTime.value = STEP * 3;
    const fb = c.createGain();
    fb.gain.value = 0.38;
    const dark = c.createBiquadFilter();
    dark.type = "lowpass";
    dark.frequency.value = 1600;
    echo = c.createGain();
    echo.gain.value = 0.5;
    echo.connect(delay);
    delay.connect(dark).connect(fb).connect(delay);
    const echoOut = c.createGain();
    echoOut.gain.value = 0.45;
    dark.connect(echoOut).connect(bus);
    echoOut.connect(wet);

    // the piano's tremolo
    keys = c.createGain();
    keys.gain.value = 0.8;
    const trem = c.createOscillator();
    trem.frequency.value = 4.2;
    const tremAmt = c.createGain();
    tremAmt.gain.value = 0.18;
    trem.connect(tremAmt).connect(keys.gain);
    trem.start();
    const keysPan = c.createStereoPanner();
    keysPan.pan.value = -0.15;
    keys.connect(keysPan).connect(bus);
    keysPan.connect(wet);

    // white noise, for the drums and the crackle
    noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const n = noise.getChannelData(0);
    for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;

    // vinyl: a soft hiss with sparse clicks, on a loop
    const vinyl = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
    const vd = vinyl.getChannelData(0);
    for (let i = 0; i < vd.length; i++) {
      vd[i] = (Math.random() * 2 - 1) * 0.06;
      if (Math.random() < 0.00035) vd[i] = (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.6);
    }
    crackle = c.createBufferSource();
    crackle.buffer = vinyl;
    crackle.loop = true;
    const vf = c.createBiquadFilter();
    vf.type = "bandpass";
    vf.frequency.value = 2600;
    vf.Q.value = 0.5;
    const vg = c.createGain();
    vg.gain.value = 0.22;
    crackle.connect(vf).connect(vg).connect(master);
    crackle.start();
  }

  // ---- the instruments -------------------------------------------------

  function piano(t: number, midi: number, vel: number, dur: number) {
    const c = ctx!;
    const f = hz(midi);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.008);
    g.gain.setTargetAtTime(vel * 0.4, t + 0.02, 0.35);
    g.gain.setTargetAtTime(0, t + dur, 0.25);
    const body = c.createOscillator();
    body.type = "sine";
    body.frequency.value = f;
    const bell = c.createOscillator();
    bell.type = "triangle";
    bell.frequency.value = f * 2.005;
    const bg = c.createGain();
    bg.gain.setValueAtTime(0.22, t);
    bg.gain.setTargetAtTime(0, t, 0.18);
    body.connect(g);
    bell.connect(bg).connect(g);
    g.connect(keys);
    const end = t + dur + 1.6;
    body.start(t);
    bell.start(t);
    body.stop(end);
    bell.stop(end);
  }

  function bass(t: number, midi: number, dur: number) {
    const c = ctx!;
    const o = c.createOscillator();
    o.type = "triangle";
    o.frequency.value = hz(midi);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 320;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.42, t + 0.02);
    g.gain.setTargetAtTime(0.28, t + 0.05, 0.2);
    g.gain.setTargetAtTime(0, t + dur, 0.06);
    o.connect(lp).connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.5);
  }

  // a plucked string with a buzzing bridge: bright, then mellowing
  function tanpura(t: number, midi: number) {
    const c = ctx!;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.01);
    g.gain.setTargetAtTime(0, t + 0.05, 1.3);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 7;
    lp.frequency.setValueAtTime(3400, t);
    lp.frequency.exponentialRampToValueAtTime(500, t + 2.4);
    const pan = c.createStereoPanner();
    pan.pan.value = 0.25;
    for (const d of [-4, 4]) {
      const o = c.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = hz(midi);
      o.detune.value = d;
      o.connect(lp);
      o.start(t);
      o.stop(t + 4.5);
    }
    lp.connect(g).connect(pan).connect(bus);
    pan.connect(wet);
  }

  function kick(t: number, vel: number) {
    const c = ctx!;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.12);
    const g = c.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + 0.4);
  }

  function hit(t: number, type: BiquadFilterType, freq: number, q: number, vel: number, len: number, verb = 0) {
    const c = ctx!;
    const s = c.createBufferSource();
    s.buffer = noise;
    s.playbackRate.value = 0.9 + rand() * 0.2;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    s.connect(f).connect(g).connect(bus);
    if (verb) {
      const w = c.createGain();
      w.gain.value = verb;
      g.connect(w).connect(wet);
    }
    s.start(t, rand() * 1.5);
    s.stop(t + len + 0.02);
  }

  function snare(t: number, vel: number) {
    hit(t, "bandpass", 1900, 0.8, vel * 0.5, 0.22, 0.5);
    const c = ctx!;
    const o = c.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
    const g = c.createGain();
    g.gain.setValueAtTime(vel * 0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + 0.14);
  }

  function flute(t: number, midi: number, dur: number) {
    const c = ctx!;
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.value = hz(midi);
    // the vibrato comes in late, as a player's does
    const vib = c.createOscillator();
    vib.frequency.value = 5.2;
    const va = c.createGain();
    va.gain.setValueAtTime(0, t);
    va.gain.linearRampToValueAtTime(hz(midi) * 0.006, t + dur * 0.7);
    vib.connect(va).connect(o.frequency);
    const breath = c.createBufferSource();
    breath.buffer = noise;
    const bf = c.createBiquadFilter();
    bf.type = "bandpass";
    bf.frequency.value = hz(midi) * 2;
    bf.Q.value = 2;
    const bg = c.createGain();
    bg.gain.value = 0.018;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.09);
    g.gain.setTargetAtTime(0, t + dur, 0.18);
    o.connect(g);
    breath.connect(bf).connect(bg).connect(g);
    const pan = c.createStereoPanner();
    pan.pan.value = 0.3;
    g.connect(pan).connect(bus);
    pan.connect(echo);
    pan.connect(wet);
    const end = t + dur + 1;
    o.start(t);
    vib.start(t);
    breath.start(t, rand());
    o.stop(end);
    vib.stop(end);
    breath.stop(end);
  }

  // ---- the arrangement -------------------------------------------------

  // a phrase of flute for the next two bars, sometimes
  let line: [number, number, number][] = []; // step in the phrase, note, length in steps
  function phrase() {
    line = [];
    if (rand() < 0.45) return;
    let at = 2 + Math.floor(rand() * 4);
    let i = 2 + Math.floor(rand() * 3);
    const notes = 3 + Math.floor(rand() * 3);
    for (let k = 0; k < notes && at < 30; k++) {
      const len = [2, 3, 4, 6][Math.floor(rand() * 4)];
      line.push([at, FLUTE[i], len]);
      at += len + (rand() < 0.3 ? 2 : 0);
      i = Math.max(0, Math.min(FLUTE.length - 1, i + [-2, -1, 1, 1, 2][Math.floor(rand() * 5)]));
    }
  }

  function play(s: number, t: number) {
    const bar = Math.floor(s / 16);
    const at = s % 16;
    const ch = bar % 4;
    const section = bar % 16;
    const drums = bar >= 2 && section < 14; // drums out for the first two bars, and two in every sixteen
    const swung = at % 2 === 1 ? t + STEP * SWING : t;

    for (const [st, note] of TANPURA) if (st === at) tanpura(t, note);

    if (at === 0) CHORDS[ch].forEach((m, k) => piano(t + k * 0.012, m, 0.07 - k * 0.006, STEP * 9));
    if (at === 7 && bar % 2 === 1) CHORDS[ch].slice(1, 4).forEach((m, k) => piano(swung + k * 0.01, m + 12, 0.03, STEP * 2));
    if (at === 10) CHORDS[ch].slice(2).forEach((m, k) => piano(t + k * 0.01, m, 0.035, STEP * 4));

    if (at === 0) bass(t, ROOTS[ch], STEP * 6);
    if (at === 10) bass(t, ROOTS[ch] + (ch === 2 ? 7 : 12), STEP * 3);
    if (at === 14 && bar % 2 === 1) bass(swung, ROOTS[(ch + 1) % 4] - 1, STEP * 1.5);

    if (drums) {
      if (at === 0 || at === 10 || (at === 7 && bar % 4 === 3)) kick(swung, at === 0 ? 0.8 : 0.55);
      if (at === 4 || at === 12) snare(t + 0.012, 0.8);
      if (at % 2 === 0) hit(t, "highpass", 7600, 0.7, at % 4 === 0 ? 0.05 : 0.08, 0.05);
      else if (rand() < 0.35) hit(swung, "highpass", 8200, 0.7, 0.03, 0.03);
    }

    if (s % 32 === 0) phrase();
    const p = s % 32;
    for (const [st, note, len] of line) if (st === p) flute(swung, note, len * STEP);
  }

  function tick() {
    const c = ctx;
    if (!c || c.state !== "running") return;
    while (next < c.currentTime + LOOK) {
      play(step, next);
      next += STEP;
      step++;
    }
    // quiet for a while: stop altogether until wanted again
    if (level === 0 && quietSince && c.currentTime - quietSince > 3) {
      window.clearInterval(timer);
      timer = 0;
      void c.suspend();
    }
  }

  function start() {
    const c = ctx;
    if (!c || timer) return;
    if (c.state !== "running") return;
    if (next < c.currentTime) {
      next = c.currentTime + 0.05;
      step = 0; // each visit starts the tune from the top
    }
    timer = window.setInterval(tick, 25);
  }

  // get the clock going (once the browser allows it) and the steps coming
  let resuming = false;
  function wake() {
    const c = ctx;
    if (!c || timer || document.hidden) return;
    if (c.state === "running") return start();
    if (resuming) return;
    resuming = true;
    void c.resume().then(() => {
      resuming = false;
      start();
    });
  }

  const onHidden = () => {
    if (!ctx) return;
    if (document.hidden) {
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      window.clearInterval(timer);
      timer = 0;
      void ctx.suspend();
    } else if (level > 0) {
      master.gain.setTargetAtTime(level * 0.55, ctx.currentTime, 0.6);
      wake();
    }
  };
  document.addEventListener("visibilitychange", onHidden);

  return {
    want(l) {
      l = Math.max(0, Math.min(1, l));
      const c = ctx;
      if (Math.abs(l - level) < 0.01) {
        if (c && l > 0 && !timer) wake();
        return;
      }
      const was = level;
      level = l;
      if (!c) return;
      if (l > 0) {
        quietSince = 0;
        wake();
      } else if (was > 0) {
        quietSince = c.currentTime;
      }
      master.gain.setTargetAtTime(l * 0.55, c.currentTime, l > was ? 0.8 : 0.4);
    },
    unlock() {
      if (disposed) return;
      if (!ctx) {
        build();
        if (ctx && level > 0) master.gain.setTargetAtTime(level * 0.55, (ctx as AudioContext).currentTime, 0.8);
      }
      if (level > 0) wake();
    },
    blocked() {
      return level > 0 && (!ctx || ctx.state !== "running");
    },
    dispose() {
      disposed = true;
      document.removeEventListener("visibilitychange", onHidden);
      window.clearInterval(timer);
      crackle?.stop();
      void ctx?.close();
      ctx = null;
    },
  };
}

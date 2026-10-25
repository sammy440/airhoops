/**
 * Procedural game sounds (Web Audio). No asset downloads, tiny, and each
 * sound scales with impact so a hard rim clank sounds harder than a kiss.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;

function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") void ctx.resume();
  return { ctx, master: master!, noise: noiseBuf! };
}

export function setMuted(m: boolean) {
  muted = m;
}

/** Call from a user gesture so browsers allow audio later. */
export function unlockAudio() {
  try {
    audio();
  } catch {}
}

function env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function noise(freq: number, q: number, peak: number, attack: number, decay: number, type: BiquadFilterType = "bandpass") {
  const { ctx, master, noise } = audio();
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, peak, attack, decay);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + attack + decay + 0.05);
  return { f, t };
}

function tone(freq: number, peak: number, decay: number, type: OscillatorType = "sine", endFreq?: number) {
  const { ctx, master } = audio();
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + decay);
  const g = ctx.createGain();
  env(g, t, peak, 0.004, decay);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + decay + 0.05);
}

const vol = (impact: number, lo = 1, hi = 9) => Math.min(1, Math.max(0.15, (impact - lo) / (hi - lo)));

export const sfx = {
  release() {
    if (muted) return;
    try {
      const { f, t } = noise(800, 0.8, 0.25, 0.03, 0.25);
      f.frequency.exponentialRampToValueAtTime(2400, t + 0.25);
    } catch {}
  },
  swish() {
    if (muted) return;
    try {
      noise(5200, 1.2, 0.5, 0.01, 0.32, "highpass");
      noise(2600, 2, 0.25, 0.02, 0.22);
    } catch {}
  },
  rim(impact: number) {
    if (muted) return;
    try {
      const v = vol(impact);
      tone(523, 0.35 * v, 0.35, "triangle");
      tone(1244, 0.18 * v, 0.22, "sine");
      tone(2093, 0.08 * v, 0.12, "sine");
      noise(3000, 4, 0.12 * v, 0.002, 0.06);
    } catch {}
  },
  board(impact: number) {
    if (muted) return;
    try {
      const v = vol(impact);
      tone(150, 0.5 * v, 0.18, "triangle", 90);
      noise(900, 1, 0.2 * v, 0.002, 0.1, "lowpass");
    } catch {}
  },
  bounce(impact: number) {
    if (muted) return;
    try {
      const v = vol(impact, 0.5, 7);
      tone(110, 0.7 * v, 0.16, "sine", 60);
      noise(400, 1, 0.15 * v, 0.002, 0.06, "lowpass");
    } catch {}
  },
  cheer(big: boolean) {
    if (muted) return;
    try {
      noise(1400, 0.6, big ? 0.22 : 0.12, 0.15, big ? 1.4 : 0.8);
      noise(700, 0.5, big ? 0.15 : 0.08, 0.2, big ? 1.2 : 0.7);
    } catch {}
  },
};

// Petits sons synthétisés (Web Audio) : aucun fichier à charger.
import { useStore } from '../store';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!useStore.getState().prefs.sound) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; delay?: number; slide?: number } = {}): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + (opts.delay ?? 0);
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * opts.slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.12, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(dur: number, opts: { gain?: number; delay?: number; freq?: number } = {}): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + (opts.delay ?? 0);
  const buffer = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
  const src = a.createBufferSource();
  src.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = opts.freq ?? 2400;
  const g = a.createGain();
  g.gain.value = opts.gain ?? 0.25;
  src.connect(filter).connect(g).connect(a.destination);
  src.start(t0);
}

export const sfx = {
  deal: () => noise(0.06, { gain: 0.18, freq: 3200 }),
  chip: () => {
    tone(1900, 0.05, { type: 'triangle', gain: 0.08 });
    tone(2600, 0.04, { type: 'triangle', gain: 0.05, delay: 0.035 });
  },
  check: () => tone(520, 0.07, { type: 'triangle', gain: 0.06 }),
  fold: () => tone(240, 0.16, { type: 'sine', gain: 0.06, slide: 0.6 }),
  turn: () => {
    tone(880, 0.12, { gain: 0.08 });
    tone(1320, 0.16, { gain: 0.07, delay: 0.11 });
  },
  snipe: () => {
    noise(0.22, { gain: 0.35, freq: 1400 });
    tone(1500, 0.25, { type: 'sawtooth', gain: 0.04, slide: 0.25 });
  },
  hit: () => {
    noise(0.35, { gain: 0.4, freq: 700 });
    tone(160, 0.4, { type: 'square', gain: 0.05, slide: 0.5 });
  },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, { type: 'triangle', gain: 0.08, delay: i * 0.08 })),
  survive: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.4, { type: 'triangle', gain: 0.07, delay: i * 0.09 })),
  doom: () => {
    tone(110, 1.2, { type: 'sawtooth', gain: 0.05, slide: 0.7 });
    tone(82, 1.4, { type: 'sine', gain: 0.09, delay: 0.1 });
  },
  pop: () => tone(700, 0.08, { type: 'sine', gain: 0.06, slide: 1.6 }),
};

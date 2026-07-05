// Simple procedural music using Web Audio API
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let padOsc: OscillatorNode | null = null;
let padGain: GainNode | null = null;
let intervalId: number | null = null;
let playing = false;

function ensureCtx() {
  if (ctx) return ctx;
  ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0.12;
  master.connect(ctx.destination);
  return ctx;
}

export function startMusic() {
  if (playing) return;
  const ac = ensureCtx();
  if (ac.state === 'suspended') ac.resume();

  // pad
  padOsc = ac.createOscillator();
  padGain = ac.createGain();
  padOsc.type = 'sine';
  padOsc.frequency.value = 110; // low warm drone
  padGain.gain.value = 0.002;
  padOsc.connect(padGain);
  padGain.connect(master!);
  padOsc.start();

  // simple arpeggio / lead
  const notes = [440, 554.37, 659.25, 830.61];
  let i = 0;
  intervalId = window.setInterval(() => {
    const t = ac.currentTime;
    const freq = notes[i % notes.length] * (Math.random() > 0.5 ? 1 : 0.5);
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.6, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4 + Math.random() * 0.2);
    osc.connect(g);
    g.connect(master!);
    osc.start(t);
    osc.stop(t + 0.6 + Math.random() * 0.2);
    i++;
  }, 350 + Math.random() * 150);

  playing = true;
}

export function stopMusic() {
  if (!playing) return;
  if (intervalId) { window.clearInterval(intervalId); intervalId = null; }
  if (padOsc) { try { padOsc.stop(); } catch {} padOsc.disconnect(); padOsc = null; }
  if (padGain) { padGain.disconnect(); padGain = null; }
  playing = false;
}

export function isMusicPlaying() { return playing; }

export default { startMusic, stopMusic, isMusicPlaying };

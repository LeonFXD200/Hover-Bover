// Minimal chiptune-style sound via the Web Audio API — no audio files needed.
// Each effect is a short oscillator blip. Lazily creates the AudioContext on
// first use (browsers require a user gesture before audio can start).

let ctx: AudioContext | null = null;

function audio(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

type Wave = "square" | "sine" | "triangle" | "sawtooth";

function blip(freq: number, dur: number, type: Wave = "square", gain = 0.08) {
  const ac = audio();
  if (ac.state === "suspended") ac.resume();
  const osc = ac.createOscillator();
  const vol = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  vol.gain.setValueAtTime(gain, ac.currentTime);
  vol.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
  osc.connect(vol).connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + dur);
}

export const sfx = {
  mow: () => blip(220 + Math.random() * 40, 0.06, "square", 0.05),
  fuel: () => {
    blip(440, 0.08, "sine");
    setTimeout(() => blip(660, 0.1, "sine"), 80);
  },
  hit: () => blip(110, 0.3, "sawtooth", 0.12),
  win: () => {
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => blip(f, 0.15, "triangle"), i * 120),
    );
  },
  lose: () => {
    [392, 330, 262].forEach((f, i) =>
      setTimeout(() => blip(f, 0.25, "triangle"), i * 160),
    );
  },
};

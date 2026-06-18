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
  nvg: () => {
    [523, 784, 1175].forEach((f, i) =>
      setTimeout(() => blip(f, 0.07, "sine", 0.055), i * 45),
    );
  },
  point: () => blip(740 + Math.random() * 70, 0.05, "triangle", 0.045),
  combo: () => {
    [660, 880].forEach((f, i) =>
      setTimeout(() => blip(f, 0.08, "triangle", 0.06), i * 55),
    );
  },
  slide: () => blip(330, 0.16, "sine", 0.055),
  shake: () => {
    blip(520 + Math.random() * 120, 0.035, "square", 0.035);
    setTimeout(() => blip(380 + Math.random() * 80, 0.035, "triangle", 0.03), 28);
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
  // Short rising fanfare when a level is cleared.
  level: () => {
    [523, 659, 784].forEach((f, i) =>
      setTimeout(() => blip(f, 0.12, "square"), i * 90),
    );
  },
  // Menacing low sting when the angry neighbour bursts in.
  boss: () => {
    [196, 175, 147, 175, 196].forEach((f, i) =>
      setTimeout(() => blip(f, 0.18, "sawtooth", 0.1), i * 110),
    );
  },
  // Sharp alarm when the torch catches you at night.
  spot: () => {
    [880, 988].forEach((f, i) =>
      setTimeout(() => blip(f, 0.1, "square", 0.09), i * 90),
    );
  },
  laserWarn: () => blip(698, 0.08, "square", 0.05),
  laserFire: () => {
    [110, 147, 196].forEach((f, i) =>
      setTimeout(() => blip(f, 0.12, "sawtooth", 0.11), i * 35),
    );
  },
  // Single warning beep — fired repeatedly (and faster) as fuel runs low.
  alarm: () => blip(1046, 0.06, "square", 0.05),
  // Rising whoosh as you launch yourself across the pitch.
  launch: () => {
    [262, 349, 466, 622, 831].forEach((f, i) =>
      setTimeout(() => blip(f, 0.08, "sawtooth", 0.07), i * 45),
    );
  },
};

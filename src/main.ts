import kaplay from "kaplay";
import { mobileControls } from "./mobileControls";
import { SPRITES } from "./sprites";
import { sfx } from "./sound";

// --- Layout -----------------------------------------------------------------

const TILE = 32; // display size of one lawn tile (world units)
const COLS = 15;
const ROWS = 11;
const HUD_H = 40;
const GAME_W = COLS * TILE; // 480
const GAME_H = HUD_H + ROWS * TILE; // 392

// --- Tuning -----------------------------------------------------------------

const PLAYER_SPEED = 120;
const DOG_SPEED = 72;
const NEIGHBOR_SPEED = 58; // the boss: relentless but slower than the dog
const FUEL_MAX = 100;
const FUEL_BURN = 3.5; // per second
const FUEL_PICKUP = 35;
const FUEL_LOW = 25; // warning threshold
const LAUNCH_SPEED = 520; // bail-out dash speed
const AIM_CURSOR_SPEED = 155; // precise target movement while lining up launch
const START_LIVES = 3;
const FUEL_SPAWN_EVERY = 6; // seconds
const SCORE_DROP_VALUE = 10;
const SCORE_DROP_MAX = 6;
const SCORE_DROP_LIFETIME = 20;
const LASER_WARN = 0.9;
const LASER_FIRE = 0.42;
const LASER_PAUSE_MIN = 0.85;
const LASER_PAUSE_MAX = 1.4;
const FLOWER_SLOW = 0.55;
const WET_SLIDE_TIME = 1.05;
const WET_SLIDE_SPEED = 155;
const WET_SLIDE_STEER = 62;
const WET_SLIDE_DRAG = 1.25;
const WET_TAP_RECOVER = 0.18;
const WET_TAP_BRAKE = 0.88;
const COMBO_WINDOW = 1.65;
const COMBO_STEP = 4;
const COMBO_MAX = 6;
const COMBO_FUEL_BONUS = 6; // each multiplier step tops up a little fuel
const LASER_BATTERY = 45; // drone powers down after this many seconds (escape valve)
const NIGHT_BASE_VISION = 44;
const NVG_VISION = 108;
const DRONE_OFFLINE_BASE_VISION = 78;
const DRONE_OFFLINE_NVG_VISION = 128;
const NVG_CHARGE_MAX = 18;
const NVG_PICKUP_CHARGE = 14;
const NVG_SPAWN_EVERY = 12;
const NVG_PICKUP_LIFETIME = 8;

// Per-level setup: tree layout, how fast the dog wakes up, and which threats
// are active. Level 1 is a fenced starter garden; later nights add torch
// stealth and then full-lawn laser sweeps.
type PlayArea = { c0: number; r0: number; cols: number; rows: number };
type HazardCfg = {
  flowerbeds?: [number, number][];
  wet?: [number, number][];
};
type NightVisionState = {
  active: boolean;
  radius: number;
  chargeFrac: number;
};
type LevelCfg = {
  trees: [number, number][];
  dogDelay: number;
  hasNeighbor: boolean;
  hasDog: boolean;
  playArea?: PlayArea;
  hazards?: HazardCfg;
  night?: boolean;
  hasLaserDrone?: boolean;
};
const FULL_PLAY_AREA: PlayArea = { c0: 0, r0: 0, cols: COLS, rows: ROWS };
const LEVELS: Record<number, LevelCfg> = {
  1: {
    playArea: { c0: 3, r0: 2, cols: 9, rows: 6 },
    trees: [
      [5, 3],
      [9, 5],
      [4, 6],
    ],
    hazards: {
      flowerbeds: [[8, 6]],
      wet: [[10, 3], [6, 7]],
    },
    dogDelay: 5,
    hasNeighbor: false,
    hasDog: true,
  },
  2: {
    trees: [
      [2, 2],
      [7, 2],
      [12, 2],
      [4, 5],
      [10, 5],
      [2, 8],
      [7, 8],
      [12, 8],
    ],
    hazards: {
      flowerbeds: [[5, 1], [9, 7], [13, 5]],
      wet: [[3, 4], [8, 4], [11, 9], [1, 7]],
    },
    dogDelay: 1.5,
    hasNeighbor: true,
    hasDog: true,
  },
  3: {
    // Lots of trees: cover to hide behind from the torch.
    trees: [
      [1, 1],
      [4, 2],
      [7, 1],
      [10, 2],
      [13, 1],
      [2, 4],
      [5, 5],
      [9, 4],
      [12, 5],
      [3, 7],
      [6, 8],
      [10, 7],
      [13, 8],
      [8, 6],
      [0, 9],
    ],
    hazards: {
      flowerbeds: [[4, 4], [11, 6], [1, 8]],
      wet: [[6, 3], [8, 8], [12, 2], [3, 9]],
    },
    dogDelay: 0,
    hasNeighbor: true,
    hasDog: false,
    night: true,
  },
  4: {
    trees: [
      [2, 1],
      [6, 2],
      [10, 1],
      [13, 3],
      [4, 5],
      [8, 6],
      [12, 7],
      [2, 9],
      [6, 9],
      [10, 9],
    ],
    hazards: {
      flowerbeds: [[5, 4], [13, 8], [1, 6]],
      wet: [[3, 3], [7, 5], [11, 5], [5, 8], [9, 2], [14, 6]],
    },
    dogDelay: 0,
    hasNeighbor: false,
    hasDog: false,
    night: true,
    hasLaserDrone: true,
  },
};

// --- Boot -------------------------------------------------------------------

const k = kaplay({
  canvas: document.getElementById("game") as HTMLCanvasElement,
  width: GAME_W,
  height: GAME_H,
  background: [13, 27, 42],
  crisp: true,
  pixelDensity: 1,
});
mobileControls.setup();

for (const s of SPRITES) {
  k.loadSprite(s.name, s.data, { sliceX: s.sliceX, anims: s.anims ?? {} });
}

const areaRect = (area: PlayArea) => ({
  left: area.c0 * TILE,
  top: HUD_H + area.r0 * TILE,
  right: (area.c0 + area.cols) * TILE,
  bottom: HUD_H + (area.r0 + area.rows) * TILE,
});
const inPlayArea = (area: PlayArea, c: number, r: number) =>
  c >= area.c0 &&
  c < area.c0 + area.cols &&
  r >= area.r0 &&
  r < area.r0 + area.rows;
const tileCenter = (c: number, r: number) =>
  k.vec2(c * TILE + TILE / 2, HUD_H + r * TILE + TILE / 2);
const clampPointToArea = (
  area: PlayArea,
  p: { x: number; y: number },
  margin = 0,
) => {
  const rect = areaRect(area);
  return k.vec2(
    k.clamp(p.x, rect.left + margin, rect.right - margin),
    k.clamp(p.y, rect.top + margin, rect.bottom - margin),
  );
};

const tileAt = (x: number, y: number) => ({
  c: Math.floor(x / TILE),
  r: Math.floor((y - HUD_H) / TILE),
});
const inBounds = (c: number, r: number) =>
  c >= 0 && c < COLS && r >= 0 && r < ROWS;

// Shortest signed difference between two angles, in (-PI, PI].
const angleDiff = (a: number, b: number) => {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

const C = {
  green: [63, 163, 77] as const,
  red: [230, 57, 70] as const,
  yellow: [255, 210, 63] as const,
  white: [244, 244, 244] as const,
  grey: [141, 153, 174] as const,
  bg: [13, 27, 42] as const,
};

const bgFill = () =>
  k.add([k.rect(GAME_W, GAME_H), k.color(...C.bg), k.pos(0, 0)]);

// --- Persistent high score --------------------------------------------------

const HISCORE_KEY = "hoverbover.hiscore";
const getHiScore = (): number => {
  try {
    return parseInt(localStorage.getItem(HISCORE_KEY) ?? "0", 10) || 0;
  } catch {
    return 0;
  }
};
const recordScore = (score: number): number => {
  const best = Math.max(getHiScore(), score);
  try {
    localStorage.setItem(HISCORE_KEY, String(best));
  } catch {
    /* storage unavailable (private mode) — just don't persist */
  }
  return best;
};

// --- Haptics (mobile only; no-op where unsupported) -------------------------

const haptic = (ms: number | number[]) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not supported */
  }
};

// --- Tiny software 3D renderer ----------------------------------------------
// A slowly rotating "lawn block" (grass-topped soil cube). It's drawn at the
// game's low internal resolution and the page upscales it with pixelated CSS,
// so a genuine 3D shape comes out chunky and pixel-art-like — a 3D pixel intro.

type V3 = [number, number, number];

const CUBE_VERTS: V3[] = [
  [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
  [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
];
// Each face: vertex indices (as a quad) + a base colour. y is down on screen,
// so the grass "top" is the y = -1 face.
const CUBE_FACES: { v: number[]; c: V3 }[] = [
  { v: [0, 1, 5, 4], c: [86, 196, 105] }, // top — grass
  { v: [3, 2, 6, 7], c: [58, 40, 24] }, // bottom — dark soil
  { v: [0, 1, 2, 3], c: [120, 78, 44] }, // soil sides
  { v: [5, 4, 7, 6], c: [120, 78, 44] },
  { v: [4, 0, 3, 7], c: [101, 66, 38] },
  { v: [1, 5, 6, 2], c: [101, 66, 38] },
];

const v3sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const v3cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const v3norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const LIGHT = v3norm([-0.4, -0.8, -0.55]);

function rotXY(p: V3, ax: number, ay: number): V3 {
  const cy = Math.cos(ay);
  const sy = Math.sin(ay);
  const x = p[0] * cy - p[2] * sy;
  const z1 = p[0] * sy + p[2] * cy;
  const cx = Math.cos(ax);
  const sx = Math.sin(ax);
  const y = p[1] * cx - z1 * sx;
  const z = p[1] * sx + z1 * cx;
  return [x, y, z];
}

// Draw the rotating block centred at (cx, cy). Call inside an onDraw().
function drawSpinningBlock(cx: number, cy: number, size: number, t: number) {
  const ay = t * 0.5; // gentle spin
  const ax = 0.55 + Math.sin(t * 0.35) * 0.22; // slight tilt wobble
  const rv = CUBE_VERTS.map((p) => rotXY(p, ax, ay));
  const F = 4.2; // perspective focal distance
  const proj = rv.map((p) => {
    const s = F / (F + p[2]);
    return k.vec2(cx + p[0] * s * size, cy + p[1] * s * size);
  });
  // Painter's algorithm: draw far faces first, flat-shaded by a fixed light.
  const faces = CUBE_FACES.map((f) => {
    const n = v3norm(
      v3cross(v3sub(rv[f.v[1]], rv[f.v[0]]), v3sub(rv[f.v[2]], rv[f.v[0]])),
    );
    const lit = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
    const br = 0.45 + 0.55 * lit;
    const avgz =
      (rv[f.v[0]][2] + rv[f.v[1]][2] + rv[f.v[2]][2] + rv[f.v[3]][2]) / 4;
    return { f, br, avgz };
  }).sort((p, q) => q.avgz - p.avgz);
  for (const { f, br } of faces) {
    k.drawPolygon({
      pts: f.v.map((i) => proj[i]),
      color: k.rgb(f.c[0] * br, f.c[1] * br, f.c[2] * br),
      outline: { width: 1, color: k.rgb(18, 22, 32) },
    });
  }
}

// ============================================================================
// LOADING — animated boot screen with a 3D pixel block
// ============================================================================

k.scene("loading", () => {
  bgFill();
  mobileControls.setAction(() => k.go("menu"), "SKIP");

  k.add([
    k.text("HOVER BOVER", { size: 36 }),
    k.anchor("center"),
    k.pos(GAME_W / 2, 54),
    k.color(...C.green),
  ]);
  k.add([
    k.text("a hover-mowing caper", { size: 13 }),
    k.anchor("center"),
    k.pos(GAME_W / 2, 84),
    k.color(...C.grey),
  ]);

  // The rotating 3D pixel lawn block.
  k.onDraw(() => drawSpinningBlock(GAME_W / 2, 200, 58, k.time()));

  const dots = k.add([
    k.text("LOADING", { size: 14 }),
    k.anchor("center"),
    k.pos(GAME_W / 2, 300),
    k.color(...C.grey),
  ]);

  const BW = 220;
  const BX = (GAME_W - BW) / 2;
  const BY = 322;
  k.add([k.rect(BW + 4, 14), k.color(40, 40, 50), k.pos(BX - 2, BY - 2)]);
  const bar = k.add([k.rect(0, 10), k.color(...C.green), k.pos(BX, BY)]);

  k.add([
    k.text("press SPACE or GO to skip", { size: 11 }),
    k.anchor("center"),
    k.pos(GAME_W / 2, GAME_H - 18),
    k.color(...C.grey),
  ]);

  let p = 0;
  k.onUpdate(() => {
    p = Math.min(1, p + k.dt() / 2.6);
    bar.width = p * BW;
    dots.text = "LOADING" + ".".repeat(1 + (Math.floor(k.time() * 3) % 3));
    if (p >= 1) k.go("menu");
  });
  k.onKeyPress("space", () => k.go("menu"));
});

// ============================================================================
// MENU — choose a mode
// ============================================================================

type MenuItem = { label: string; go: () => void };

k.scene("menu", () => {
  bgFill();
  k.onDraw(() => drawSpinningBlock(GAME_W - 70, 70, 26, k.time()));

  k.add([
    k.text("HOVER BOVER", { size: 34 }),
    k.anchor("center"),
    k.pos(GAME_W / 2, 70),
    k.color(...C.green),
  ]);

  const best = getHiScore();
  if (best > 0) {
    k.add([
      k.text(`BEST  ${best}`, { size: 14 }),
      k.anchor("center"),
      k.pos(GAME_W / 2, 104),
      k.color(...C.yellow),
    ]);
  }

  const items: MenuItem[] = [
    { label: "1 PLAYER  -  Story", go: () => k.go("story") },
    {
      label: "2 PLAYER  -  Versus",
      go: () => k.go("twoplayer", { coop: false }),
    },
    { label: "2 PLAYER  -  Co-op", go: () => k.go("twoplayer", { coop: true }) },
  ];

  let sel = 0;
  const labels = items.map((it, i) =>
    k.add([
      k.text(it.label, { size: 18 }),
      k.anchor("center"),
      k.pos(GAME_W / 2, 150 + i * 42),
      k.color(...C.white),
      k.opacity(1),
    ]),
  );

  const refresh = () => {
    labels.forEach((l, i) => {
      l.text = (i === sel ? "> " : "  ") + items[i].label;
      l.color = i === sel ? k.rgb(...C.yellow) : k.rgb(...C.white);
    });
  };
  refresh();

  k.add([
    k.text("up / down to choose   -   SPACE or GO to play", { size: 12 }),
    k.anchor("center"),
    k.pos(GAME_W / 2, GAME_H - 28),
    k.color(...C.grey),
  ]);

  let mobileMenuT = 0;
  const moveSel = (d: number) => {
    sel = (sel + d + items.length) % items.length;
    sfx.mow();
    refresh();
  };
  mobileControls.setAction(() => items[sel].go(), "PLAY");

  k.onUpdate(() => {
    mobileMenuT = Math.max(0, mobileMenuT - k.dt());
    const mobile = mobileControls.direction();
    if (
      mobileMenuT <= 0 &&
      Math.abs(mobile.y) > 0.55 &&
      Math.abs(mobile.y) >= Math.abs(mobile.x)
    ) {
      moveSel(mobile.y > 0 ? 1 : -1);
      mobileMenuT = 0.24;
    }
  });

  k.onClick(() => {
    const p = k.mousePos();
    const idx = items.findIndex((_, i) => Math.abs(p.y - (150 + i * 42)) < 20);
    if (idx < 0) return;
    sel = idx;
    refresh();
    items[sel].go();
  });

  k.onKeyPress("up", () => moveSel(-1));
  k.onKeyPress("down", () => moveSel(1));
  k.onKeyPress("w", () => moveSel(-1));
  k.onKeyPress("s", () => moveSel(1));
  k.onKeyPress("space", () => items[sel].go());
  k.onKeyPress("1", () => items[0].go());
  k.onKeyPress("2", () => items[1].go());
  k.onKeyPress("3", () => items[2].go());
});

// ============================================================================
// STORY — typewriter intro
// ============================================================================

k.scene("story", () => {
  bgFill();

  // --- Illustrated night-suburb backdrop (drawn behind the text) -----------
  // Moon
  k.add([
    k.circle(15),
    k.pos(GAME_W - 50, 46),
    k.color(238, 232, 190),
    k.opacity(0.9),
  ]);
  // Twinkling stars
  const STAR_POS: [number, number][] = [
    [20, 20], [60, 34], [96, 18], [18, 56], [44, 96],
    [150, 14], [332, 15], [402, 26], [442, 58], [465, 92],
    [420, 104], [30, 110], [455, 18],
  ];
  STAR_POS.forEach(([x, y], i) => {
    const star = k.add([
      k.rect(2, 2),
      k.pos(x, y),
      k.color(...C.white),
      k.opacity(1),
    ]);
    const sp = 1.5 + (i % 4) * 0.6;
    const ph = i * 1.3;
    star.onUpdate(() => {
      star.opacity = 0.25 + 0.75 * Math.abs(Math.sin(k.time() * sp + ph));
    });
  });
  // Ground / drive
  k.add([k.rect(GAME_W, 60), k.pos(0, GAME_H - 60), k.color(26, 46, 30)]);
  // House
  k.add([k.rect(80, 52), k.pos(36, GAME_H - 95), k.color(30, 34, 52)]);
  k.add([
    k.polygon([k.vec2(30, 0), k.vec2(122, 0), k.vec2(76, -26)]),
    k.pos(0, GAME_H - 95),
    k.color(20, 22, 36),
  ]);
  const window1 = k.add([
    k.rect(16, 16),
    k.pos(64, GAME_H - 84),
    k.color(...C.yellow),
    k.opacity(1),
  ]);
  window1.onUpdate(() => {
    window1.opacity = 0.7 + 0.3 * Math.abs(Math.sin(k.time() * 2));
  });
  // The "borrowed" mower parked on the drive, idling (right of the text)
  const parked = k.add([
    k.sprite("player", { anim: "hover" }),
    k.anchor("center"),
    k.pos(410, GAME_H - 40),
    k.scale(1.6),
  ]);
  const py = parked.pos.y;
  parked.onUpdate(() => {
    parked.pos.y = py + Math.sin(k.time() * 5) * 3;
  });
  // The dog, watching
  k.add([
    k.sprite("dog"),
    k.anchor("center"),
    k.pos(452, GAME_H - 36),
    k.scale(1.3),
  ]);

  k.add([
    k.text("THE BORROWED MOWER", { size: 24 }),
    k.anchor("center"),
    k.pos(GAME_W / 2, 60),
    k.color(...C.yellow),
    k.z(5),
  ]);

  const story =
    "For thirty years your neighbour Gertrude has\n" +
    "won Best Lawn on the street.\n\n" +
    "This morning she left her prized\n" +
    "HOVER-MOWER out on the drive.\n\n" +
    "You 'borrowed' it. Start with the little\n" +
    "side garden, then mow every lawn and slip\n" +
    "it back before she notices.\n\n" +
    "If trouble clips you, grab your scattered\n" +
    "points before the night gets worse.";

  const txt = k.add([
    k.text("", { size: 14, align: "center", lineSpacing: 6 }),
    k.anchor("center"),
    k.pos(GAME_W / 2, GAME_H / 2 + 10),
    k.color(...C.white),
  ]);

  const hint = k.add([
    k.text("press SPACE or GO to start mowing", { size: 13 }),
    k.anchor("center"),
    k.pos(GAME_W / 2, GAME_H - 28),
    k.color(...C.green),
    k.opacity(1),
  ]);

  let shown = 0;
  k.onUpdate(() => {
    if (shown < story.length) {
      shown = Math.min(story.length, shown + k.dt() * 50);
      txt.text = story.slice(0, Math.floor(shown));
    }
    // blink the hint
    hint.opacity = Math.floor(k.time() * 2) % 2 ? 0.3 : 1;
  });

  const advance = () => {
    if (shown < story.length) {
      shown = story.length; // first press: reveal the rest
      txt.text = story;
    } else {
      k.go("game", { level: 1, score: 0, lives: START_LIVES });
    }
  };
  mobileControls.setAction(advance, "GO");
  k.onKeyPress("space", advance);
  k.onClick(advance);
});

// --- Night vision / darkness rendering --------------------------------------

function drawNvgOverlay(vision: NightVisionState, focus: any) {
  if (!vision.active) return;

  const pulse = 0.5 + Math.sin(k.time() * 4.4) * 0.5;
  const lowChargeBlink = vision.chargeFrac < 0.25 ? Math.floor(k.time() * 9) % 2 : 1;
  const alpha = lowChargeBlink ? 1 : 0.35;

  k.drawRect({
    pos: k.vec2(0, HUD_H),
    width: GAME_W,
    height: GAME_H - HUD_H,
    color: k.rgb(13, 255, 95),
    opacity: (0.035 + pulse * 0.018) * alpha,
  });

  for (let y = HUD_H + 3; y < GAME_H; y += 8) {
    k.drawLine({
      p1: k.vec2(0, y),
      p2: k.vec2(GAME_W, y),
      width: 1,
      color: k.rgb(92, 255, 137),
      opacity: 0.08 * alpha,
    });
  }

  k.drawCircle({
    pos: focus,
    radius: vision.radius + 12 + pulse * 4,
    color: k.rgb(45, 255, 103),
    opacity: 0.08 * alpha,
  });
  k.drawCircle({
    pos: focus,
    radius: vision.radius * 0.52,
    color: k.rgb(192, 255, 198),
    opacity: 0.035 * alpha,
  });

  const r = Math.max(28, vision.radius * 0.48);
  const tick = 12;
  const col = k.rgb(154, 255, 162);
  k.drawLine({
    p1: focus.add(k.vec2(-r, 0)),
    p2: focus.add(k.vec2(-r + tick, 0)),
    width: 1,
    color: col,
    opacity: 0.7 * alpha,
  });
  k.drawLine({
    p1: focus.add(k.vec2(r - tick, 0)),
    p2: focus.add(k.vec2(r, 0)),
    width: 1,
    color: col,
    opacity: 0.7 * alpha,
  });
  k.drawLine({
    p1: focus.add(k.vec2(0, -r)),
    p2: focus.add(k.vec2(0, -r + tick)),
    width: 1,
    color: col,
    opacity: 0.7 * alpha,
  });
  k.drawLine({
    p1: focus.add(k.vec2(0, r - tick)),
    p2: focus.add(k.vec2(0, r)),
    width: 1,
    color: col,
    opacity: 0.7 * alpha,
  });
}

// --- Night boss: torch, line-of-sight detection, darkness rendering ---------

const TORCH_RANGE = 155;
const TORCH_HALF = 0.52; // half-angle of the beam (~30°)
const BOSS_PATROL = 46;
const BOSS_HUNT = 74;

function setupNightBoss(
  boss: any,
  player: any,
  isTree: (c: number, r: number) => boolean,
  getNightVision: () => NightVisionState,
) {
  let facing = Math.PI; // start looking left
  let hunting = false;
  let lastSeen: any = null;
  let wander = k.vec2(GAME_W / 2, HUD_H + (ROWS * TILE) / 2);

  // True if nothing blocks the straight line a->b (trees give cover).
  const losClear = (ax: number, ay: number, bx: number, by: number) => {
    const dx = bx - ax;
    const dy = by - ay;
    const steps = Math.ceil(Math.hypot(dx, dy) / 8);
    for (let i = 1; i < steps; i++) {
      const t = tileAt(ax + (dx * i) / steps, ay + (dy * i) / steps);
      if (inBounds(t.c, t.r) && isTree(t.c, t.r)) return false;
    }
    return true;
  };

  boss.onUpdate(() => {
    const to = player.pos.sub(boss.pos);
    const dist = to.len();
    const ang = Math.atan2(to.y, to.x);
    const detected =
      dist <= TORCH_RANGE &&
      Math.abs(angleDiff(ang, facing)) <= TORCH_HALF &&
      losClear(boss.pos.x, boss.pos.y, player.pos.x, player.pos.y);

    if (detected) {
      if (!hunting) sfx.spot();
      hunting = true;
      lastSeen = k.vec2(player.pos.x, player.pos.y);
      facing += angleDiff(ang, facing) * Math.min(1, k.dt() * 8);
      if (dist > 1) {
        boss.pos = boss.pos.add(to.unit().scale(BOSS_HUNT * k.dt()));
        boss.flipX = to.x < 0;
      }
    } else {
      hunting = false;
      let target = lastSeen ?? wander;
      let td = target.sub(boss.pos);
      if (td.len() < 10) {
        lastSeen = null;
        // new roam point — varies over time, no RNG needed (keeps replays sane)
        wander = k.vec2(
          40 + ((Math.floor(k.time() * 0.7) * 137) % (GAME_W - 80)),
          HUD_H + 30 + ((Math.floor(k.time() * 0.9) * 89) % (ROWS * TILE - 60)),
        );
        target = wander;
        td = target.sub(boss.pos);
      }
      if (td.len() > 1) {
        boss.pos = boss.pos.add(td.unit().scale(BOSS_PATROL * k.dt()));
        boss.flipX = td.x < 0;
      }
      const sweep = Math.sin(k.time() * 1.6) * 0.6;
      const moveAng = Math.atan2(td.y, td.x) + sweep;
      facing += angleDiff(moveAng, facing) * Math.min(1, k.dt() * 3);
    }
  });

  const torchPts = () => {
    const pts = [k.vec2(boss.pos.x, boss.pos.y)];
    const SEG = 10;
    for (let i = 0; i <= SEG; i++) {
      const a = facing - TORCH_HALF + (2 * TORCH_HALF * i) / SEG;
      pts.push(
        k.vec2(
          boss.pos.x + Math.cos(a) * TORCH_RANGE,
          boss.pos.y + Math.sin(a) * TORCH_RANGE,
        ),
      );
    }
    return pts;
  };

  // Darkness over the playfield, with light "holes" cut out for the player's
  // headlights, the torch beam, and a small glow around the neighbour.
  k.onDraw(() => {
    const vision = getNightVision();
    k.drawSubtracted(
      () =>
        k.drawRect({
          pos: k.vec2(0, HUD_H),
          width: GAME_W,
          height: GAME_H - HUD_H,
          color: k.rgb(4, 6, 16),
          opacity: 0.94,
        }),
      () => {
        k.drawCircle({
          pos: player.pos,
          radius: vision.radius,
          color: k.rgb(255, 255, 255),
        });
        k.drawCircle({ pos: boss.pos, radius: 24, color: k.rgb(255, 255, 255) });
        k.drawPolygon({ pts: torchPts(), color: k.rgb(255, 255, 255) });
      },
    );
    // Tint the beam: yellow while searching, red once she's onto you.
    k.drawPolygon({
      pts: torchPts(),
      color: hunting ? k.rgb(255, 90, 70) : k.rgb(255, 226, 120),
      opacity: 0.16,
    });
    drawNvgOverlay(vision, player.pos);
  });

  return { isHunting: () => hunting };
}

// --- Second-night enemy: a drone that sweeps full rows / columns with lasers -

type LaserAxis = "row" | "col";
type LaserPulse = {
  axis: LaserAxis;
  index: number;
  phase: "warn" | "fire";
  t: number;
};

function setupLaserDrone(
  drone: any,
  player: any,
  playArea: PlayArea,
  hitPlayer: (reason: string, resetPos: () => void) => boolean,
  getNightVision: () => NightVisionState,
) {
  const rect = areaRect(playArea);
  let cooldown = 1.0;
  let pulse: LaserPulse | null = null;
  // Battery is a level-long timer (NOT reset on death): once it runs out the
  // drone powers down and stops firing, giving a guaranteed window to finish
  // the lawn. It's the escape valve that keeps the final night winnable.
  let battery = LASER_BATTERY;
  let offline = false;

  const resetDrone = () => {
    pulse = null;
    cooldown = 1.2;
    drone.pos = k.vec2((rect.left + rect.right) / 2, rect.top + 18);
  };

  const choosePulse = () => {
    const axis: LaserAxis = Math.random() < 0.55 ? "row" : "col";
    pulse = {
      axis,
      index: axis === "row" ? k.randi(0, playArea.rows) : k.randi(0, playArea.cols),
      phase: "warn",
      t: LASER_WARN,
    };
    sfx.laserWarn();
  };

  const pulseBounds = (p: LaserPulse) => {
    if (p.axis === "row") {
      return {
        x: rect.left,
        y: rect.top + p.index * TILE,
        w: rect.right - rect.left,
        h: TILE,
      };
    }
    return {
      x: rect.left + p.index * TILE,
      y: rect.top,
      w: TILE,
      h: rect.bottom - rect.top,
    };
  };

  const pulseCenter = (p: LaserPulse) => {
    const b = pulseBounds(p);
    return p.axis === "row"
      ? k.vec2(rect.right - 20, b.y + b.h / 2)
      : k.vec2(b.x + b.w / 2, rect.top + 20);
  };

  const playerInPulse = (p: LaserPulse) => {
    const b = pulseBounds(p);
    return (
      player.pos.x >= b.x &&
      player.pos.x <= b.x + b.w &&
      player.pos.y >= b.y &&
      player.pos.y <= b.y + b.h
    );
  };

  drone.onUpdate(() => {
    if (!offline) {
      battery = Math.max(0, battery - k.dt());
      if (battery <= 0) {
        offline = true;
        pulse = null; // cancel any sweep in progress
        sfx.boss();
      }
    }

    if (offline) {
      // Powered down — drift up to a corner and hum, no more lasers.
      const rest = k.vec2(rect.left + 24, rect.top + 14 + Math.sin(k.time() * 2) * 3);
      drone.pos = drone.pos.add(rest.sub(drone.pos).scale(Math.min(1, k.dt() * 2)));
      drone.angle = Math.sin(k.time() * 6) * 8;
      return;
    }

    const idle = k.vec2(
      (rect.left + rect.right) / 2 + Math.sin(k.time() * 1.2) * 70,
      rect.top + 18 + Math.sin(k.time() * 2.1) * 4,
    );
    const target = pulse ? pulseCenter(pulse) : idle;
    const toTarget = target.sub(drone.pos);
    if (toTarget.len() > 1) {
      drone.pos = drone.pos.add(toTarget.scale(Math.min(1, k.dt() * 4.5)));
      drone.flipX = toTarget.x < 0;
    }

    if (!pulse) {
      cooldown -= k.dt();
      if (cooldown <= 0) choosePulse();
      return;
    }

    pulse.t -= k.dt();
    if (pulse.phase === "warn" && pulse.t <= 0) {
      pulse.phase = "fire";
      pulse.t = LASER_FIRE;
      sfx.laserFire();
      haptic(45);
      k.shake(3);
    } else if (pulse.phase === "fire") {
      if (playerInPulse(pulse)) {
        const hit = hitPlayer("The drone's lawn laser swept you up!", resetDrone);
        if (hit) return;
      }
      if (pulse.t <= 0) {
        pulse = null;
        cooldown = LASER_PAUSE_MIN + Math.random() * (LASER_PAUSE_MAX - LASER_PAUSE_MIN);
      }
    }
  });

  k.onDraw(() => {
    const vision = getNightVision();
    const playerRadius = offline
      ? vision.active
        ? DRONE_OFFLINE_NVG_VISION
        : DRONE_OFFLINE_BASE_VISION
      : vision.radius;

    // Night lifts a little once the drone is dead.
    k.drawSubtracted(
      () =>
        k.drawRect({
          pos: k.vec2(0, HUD_H),
          width: GAME_W,
          height: GAME_H - HUD_H,
          color: k.rgb(3, 4, 12),
          opacity: offline ? 0.55 : 0.9,
        }),
      () => {
        k.drawCircle({
          pos: player.pos,
          radius: playerRadius,
          color: k.rgb(255, 255, 255),
        });
        if (!offline) {
          k.drawCircle({ pos: drone.pos, radius: 36, color: k.rgb(255, 255, 255) });
        }
      },
    );
    drawNvgOverlay(vision, player.pos);

    // Battery gauge under the HUD.
    const BAT_W = 120;
    const bx = GAME_W / 2 - BAT_W / 2;
    const frac = battery / LASER_BATTERY;
    k.drawRect({
      pos: k.vec2(bx - 2, HUD_H + 6),
      width: BAT_W + 4,
      height: 8,
      color: k.rgb(8, 14, 24),
      opacity: 0.85,
      outline: { width: 1, color: k.rgb(...C.grey) },
    });
    k.drawRect({
      pos: k.vec2(bx, HUD_H + 7),
      width: Math.max(0, frac * BAT_W),
      height: 6,
      color: frac < 0.25 ? k.rgb(...C.red) : k.rgb(72, 202, 228),
    });
    k.drawText({
      text: offline ? "DRONE OFFLINE" : "DRONE BATTERY",
      pos: k.vec2(GAME_W / 2, HUD_H + 22),
      size: 8,
      anchor: "center",
      color: offline ? k.rgb(...C.green) : k.rgb(...C.grey),
    });

    if (!pulse) return;
    const b = pulseBounds(pulse);
    const warn = pulse.phase === "warn";
    k.drawRect({
      pos: k.vec2(b.x, b.y),
      width: b.w,
      height: b.h,
      color: warn ? k.rgb(255, 70, 70) : k.rgb(255, 18, 40),
      opacity: warn ? 0.18 + Math.abs(Math.sin(k.time() * 18)) * 0.14 : 0.42,
    });
    if (pulse.axis === "row") {
      const y = b.y + b.h / 2;
      k.drawLine({
        p1: k.vec2(b.x, y),
        p2: k.vec2(b.x + b.w, y),
        width: warn ? 2 : 7,
        color: warn ? k.rgb(255, 210, 63) : k.rgb(255, 244, 244),
        opacity: warn ? 0.65 : 0.95,
      });
    } else {
      const x = b.x + b.w / 2;
      k.drawLine({
        p1: k.vec2(x, b.y),
        p2: k.vec2(x, b.y + b.h),
        width: warn ? 2 : 7,
        color: warn ? k.rgb(255, 210, 63) : k.rgb(255, 244, 244),
        opacity: warn ? 0.65 : 0.95,
      });
    }
  });

  return { reset: resetDrone };
}

// ============================================================================
// GAME
// ============================================================================

type GameOpts = { level: number; score: number; lives: number };

k.scene("game", (opts: GameOpts) => {
  const level = opts.level;
  const cfg = LEVELS[level] ?? LEVELS[1];
  const playArea = cfg.playArea ?? FULL_PLAY_AREA;
  let lives = opts.lives;
  let fuel = FUEL_MAX;
  let score = opts.score;
  let dogAwake = false;
  let invuln = 0;
  let nvgCharge = 0;
  let nvgPulse = 0;

  // Player state machine: normal driving, stalled (out of fuel, aiming a
  // bail-out), launching across the pitch, or crash-landing.
  type Mode = "drive" | "stall" | "launch" | "crash";
  let mode: Mode = "drive";
  let aim = k.vec2(1, 0); // last heading — seeds the bail-out direction
  let aimTarget: any = null;
  let launchDir = k.vec2(1, 0);
  let launchDist = 0;
  let alarmT = 0;
  let lastMouse: any = k.mousePos();
  let slideT = 0;
  let slideCooldown = 0;
  let slideVel = k.vec2(0, 0);
  let wetShakeT = 0;
  let wetTapFlash = 0;
  const moveKeyState: Record<string, boolean> = {};
  let comboCount = 0;
  let comboTimer = 0;
  let comboPulse = 0;

  const nvgActive = () => cfg.night === true && nvgCharge > 0;
  const getNightVision = (): NightVisionState => ({
    active: nvgActive(),
    radius: nvgActive() ? NVG_VISION : NIGHT_BASE_VISION,
    chargeFrac: nvgCharge / NVG_CHARGE_MAX,
  });

  // --- Build the lawn -------------------------------------------------------
  const grass: any[][] = [];
  const mown: boolean[][] = [];
  const trees = new Set<string>();
  for (const [c, r] of cfg.trees) trees.add(`${c},${r}`);
  const isTree = (c: number, r: number) => trees.has(`${c},${r}`);
  const flowerbeds = new Set<string>();
  for (const [c, r] of cfg.hazards?.flowerbeds ?? []) flowerbeds.add(`${c},${r}`);
  const wetGrass = new Set<string>();
  for (const [c, r] of cfg.hazards?.wet ?? []) wetGrass.add(`${c},${r}`);
  const isPlayableTile = (c: number, r: number) => inPlayArea(playArea, c, r);
  const isFlowerbed = (c: number, r: number) => flowerbeds.has(`${c},${r}`);
  const isWetGrass = (c: number, r: number) => wetGrass.has(`${c},${r}`);

  let toMow = 0;
  for (let r = 0; r < ROWS; r++) {
    grass[r] = [];
    mown[r] = [];
    for (let c = 0; c < COLS; c++) {
      const x = c * TILE;
      const y = HUD_H + r * TILE;
      if (!isPlayableTile(c, r)) {
        k.add([k.sprite("mown"), k.pos(x, y), k.scale(2), k.z(0)]);
        mown[r][c] = true;
        continue;
      }
      if (isTree(c, r)) {
        k.add([k.sprite("mown"), k.pos(x, y), k.scale(2), k.z(0)]);
        k.add([k.sprite("tree"), k.pos(x, y), k.scale(2), k.z(2), "tree"]);
        mown[r][c] = true;
        continue;
      }
      if (isFlowerbed(c, r)) {
        k.add([k.sprite("mown"), k.pos(x, y), k.scale(2), k.z(0)]);
        k.add([k.sprite("flowerbed"), k.pos(x, y), k.scale(2), k.z(2)]);
        mown[r][c] = true;
        continue;
      }
      grass[r][c] = k.add([k.sprite("grass"), k.pos(x, y), k.scale(2), k.z(0)]);
      if (isWetGrass(c, r)) {
        k.add([k.sprite("wetgrass"), k.pos(x, y), k.scale(2), k.z(1)]);
      }
      mown[r][c] = false;
      toMow++;
    }
  }
  const totalToMow = toMow;

  if (cfg.playArea) {
    const r = areaRect(playArea);
    const fence = (x: number, y: number, w: number, h: number) =>
      k.add([k.rect(w, h), k.pos(x, y), k.color(106, 66, 36), k.z(3)]);
    fence(r.left - 4, r.top - 4, r.right - r.left + 8, 4);
    fence(r.left - 4, r.bottom, r.right - r.left + 8, 4);
    fence(r.left - 4, r.top, 4, r.bottom - r.top);
    fence(r.right, r.top, 4, r.bottom - r.top);
  }

  // --- Player ---------------------------------------------------------------
  const playerStart = () => tileCenter(playArea.c0, playArea.r0);
  const startPos = playerStart();
  const player = k.add([
    k.sprite("player", { anim: "hover" }),
    k.pos(startPos.x, startPos.y),
    k.anchor("center"),
    k.scale(2),
    k.area({ scale: 0.6 }),
    k.rotate(0),
    k.opacity(1),
    k.z(5),
    "player",
  ]);

  const tryMove = (dx: number, dy: number) => {
    const move = (nx: number, ny: number) => {
      const half = 10;
      const rect = areaRect(playArea);
      nx = k.clamp(nx, rect.left + half, rect.right - half);
      ny = k.clamp(ny, rect.top + half, rect.bottom - half);
      for (const [ox, oy] of [
        [-half, -half],
        [half, -half],
        [-half, half],
        [half, half],
      ]) {
        const t = tileAt(nx + ox, ny + oy);
        if (
          inBounds(t.c, t.r) &&
          (!isPlayableTile(t.c, t.r) || isTree(t.c, t.r))
        ) {
          return false;
        }
      }
      return { nx, ny };
    };
    const rx = move(player.pos.x + dx, player.pos.y);
    if (rx) player.pos.x = rx.nx;
    const ry = move(player.pos.x, player.pos.y + dy);
    if (ry) player.pos.y = ry.ny;
  };

  const currentTile = () => tileAt(player.pos.x, player.pos.y);
  const onFlowerbed = () => {
    const t = currentTile();
    return inBounds(t.c, t.r) && isFlowerbed(t.c, t.r);
  };
  const onWetGrass = () => {
    const t = currentTile();
    return inBounds(t.c, t.r) && isWetGrass(t.c, t.r);
  };

  const comboMultFor = (count = comboCount) =>
    Math.min(COMBO_MAX, 1 + Math.floor(Math.max(0, count) / COMBO_STEP));
  const resetCombo = () => {
    comboCount = 0;
    comboTimer = 0;
    comboPulse = 0;
  };
  const scorePop = (
    text: string,
    pos: any,
    color: readonly [number, number, number],
    size = 10,
  ) => {
    const pop = k.add([
      k.text(text, { size }),
      k.anchor("center"),
      k.pos(pos.x, pos.y),
      k.color(...color),
      k.z(12),
      k.opacity(1),
      k.lifespan(0.5, { fade: 0.2 }),
    ]);
    pop.onUpdate(() => {
      pop.pos.y -= 20 * k.dt();
    });
  };
  const awardMowScore = (c: number, r: number) => {
    const before = comboTimer > 0 ? comboMultFor() : 1;
    comboCount = comboTimer > 0 ? comboCount + 1 : 1;
    comboTimer = COMBO_WINDOW;
    const mult = comboMultFor();
    const gained = 10 * mult;
    score += gained;
    // Only spawn a floating label when the multiplier actually ticks up.
    // (Popping text on *every* mowed tile created a new text entity each
    // tile, and rasterizing a fresh glyph texture per tile is what made
    // movement stutter once a combo got going.)
    if (mult > before) {
      comboPulse = 0.4;
      sfx.combo();
      haptic(20);
      fuel = Math.min(FUEL_MAX, fuel + COMBO_FUEL_BONUS); // combos ease the fuel squeeze
      scorePop(`x${mult}!`, tileCenter(c, r).add(k.vec2(0, -16)), C.yellow, 14);
    }
  };

  const winLevel = () => {
    sfx.level();
    if (level === 1) {
      k.go("cutscene", { score, lives }); // Gertrude bursts in -> level 2
    } else if (level === 2) {
      k.go("nightfall", { score, lives }); // night falls -> level 3
    } else if (level === 3) {
      k.go("laserfall", { score, lives }); // the drone arrives -> level 4
    } else {
      sfx.win();
      k.go("win", {
        score,
        reason: "You slipped the mower back after two impossible nights.",
      });
    }
  };

  // Mow the tile at a world point; returns true if it was unmown grass.
  const mowAt = (x: number, y: number): boolean => {
    const t = tileAt(x, y);
    if (inBounds(t.c, t.r) && isPlayableTile(t.c, t.r) && !mown[t.r][t.c]) {
      mown[t.r][t.c] = true;
      k.destroy(grass[t.r][t.c]);
      k.add([
        k.sprite("mown"),
        k.pos(t.c * TILE, HUD_H + t.r * TILE),
        k.scale(2),
        k.z(0),
      ]);
      awardMowScore(t.c, t.r);
      toMow--;
      return true;
    }
    return false;
  };

  const grabPoint = (point: any) => {
    if (point.picked) return;
    point.picked = true;
    const value = point.value ?? SCORE_DROP_VALUE;
    score += value;
    sfx.point();
    const pop = k.add([
      k.text(`+${value}`, { size: 10 }),
      k.anchor("center"),
      k.pos(point.pos.x, point.pos.y - 12),
      k.color(...C.yellow),
      k.z(12),
      k.opacity(1),
      k.lifespan(0.45, { fade: 0.2 }),
    ]);
    pop.onUpdate(() => {
      pop.pos.y -= 18 * k.dt();
    });
    point.opacity = 0;
    k.destroy(point);
  };

  const dropScore = (origin: any) => {
    const count = Math.min(SCORE_DROP_MAX, Math.floor(score / SCORE_DROP_VALUE));
    if (count <= 0) return;
    score -= count * SCORE_DROP_VALUE;

    for (let i = 0; i < count; i++) {
      let pos = clampPointToArea(playArea, origin, 12);
      for (let attempt = 0; attempt < 10; attempt++) {
        const angle = (Math.PI * 2 * (i + attempt / 3)) / count + Math.random() * 0.35;
        const dist = 24 + Math.random() * 38 + attempt * 3;
        const candidate = clampPointToArea(
          playArea,
          {
            x: origin.x + Math.cos(angle) * dist,
            y: origin.y + Math.sin(angle) * dist,
          },
          12,
        );
        const tile = tileAt(candidate.x, candidate.y);
        if (
          inBounds(tile.c, tile.r) &&
          isPlayableTile(tile.c, tile.r) &&
          !isTree(tile.c, tile.r) &&
          !isFlowerbed(tile.c, tile.r)
        ) {
          pos = candidate;
          break;
        }
      }

      const point: any = k.add([
        k.sprite("point"),
        k.pos(pos.x, pos.y),
        k.anchor("center"),
        k.scale(1.4),
        k.area({ scale: 0.7 }),
        k.rotate(0),
        k.opacity(1),
        k.z(4),
        k.lifespan(SCORE_DROP_LIFETIME, { fade: 1.5 }),
        "point",
      ]);
      point.value = SCORE_DROP_VALUE;
      const phase = Math.random() * Math.PI * 2;
      point.onUpdate(() => {
        point.angle = Math.sin(k.time() * 5 + phase) * 10;
      });
    }
  };

  const grabFuel = (can: any) => {
    fuel = Math.min(FUEL_MAX, fuel + FUEL_PICKUP);
    sfx.fuel();
    k.destroy(can);
    if (mode === "stall") {
      mode = "drive"; // a can landed on you mid-stall — saved!
      invuln = 1.5;
    }
  };

  const grabNvg = (goggles: any) => {
    if (goggles.picked) return;
    goggles.picked = true;
    nvgCharge = Math.min(NVG_CHARGE_MAX, nvgCharge + NVG_PICKUP_CHARGE);
    nvgPulse = 0.45;
    sfx.nvg();
    haptic(25);
    scorePop("NVG", goggles.pos.add(k.vec2(0, -14)), C.green, 12);
    k.destroy(goggles);
  };

  const resetAimTarget = () => {
    aimTarget = clampPointToArea(playArea, player.pos.add(aim.scale(96)), 12);
  };

  const updateAimFromTarget = () => {
    if (!aimTarget) return;
    const toTarget = aimTarget.sub(player.pos);
    if (toTarget.len() > 8) aim = toTarget.unit();
  };

  const startLaunch = () => {
    if (mode !== "stall") return;
    updateAimFromTarget();
    mode = "launch";
    launchDir = aim.len() > 0 ? aim.unit() : k.vec2(1, 0);
    aimTarget = null;
    launchDist = 0;
    invuln = 99; // immune while rocketing through trees
    sfx.launch();
  };

  const endLaunch = (survived: boolean) => {
    if (survived) {
      mode = "drive";
      invuln = 1.5; // grace flash so you aren't instantly caught on landing
    } else {
      mode = "crash";
      invuln = 1.5;
      k.wait(1.0, () => {
        sfx.lose();
        k.go("lose", {
          score,
          reason: "Out of fuel — you didn't reach a can in time!",
        });
      });
    }
  };

  const readDir = () => {
    let dx = 0;
    let dy = 0;
    if (k.isKeyDown("left") || k.isKeyDown("a")) dx -= 1;
    if (k.isKeyDown("right") || k.isKeyDown("d")) dx += 1;
    if (k.isKeyDown("up") || k.isKeyDown("w")) dy -= 1;
    if (k.isKeyDown("down") || k.isKeyDown("s")) dy += 1;
    const mobile = mobileControls.direction();
    dx += mobile.x;
    dy += mobile.y;
    return { dx, dy };
  };
  const readMoveTapCount = () => {
    let taps = mobileControls.consumeMoveTaps();
    for (const key of ["left", "right", "up", "down", "a", "d", "w", "s"]) {
      const down = k.isKeyDown(key as any);
      if (down && !moveKeyState[key]) taps++;
      moveKeyState[key] = down;
    }
    return taps;
  };

  let mobileActionLabel = "";
  const syncMobileAction = () => {
    const nextLabel = mode === "stall" ? "FIRE" : "GO";
    if (nextLabel === mobileActionLabel) return;
    mobileActionLabel = nextLabel;
    mobileControls.setAction(startLaunch, nextLabel);
  };
  syncMobileAction();

  k.onKeyPress("space", startLaunch);
  k.onClick(() => {
    if (mode !== "stall") return;
    // Only treat clicks inside the lawn as a launch — clicking the HUD or the
    // letterboxed margin shouldn't fire you off in a random direction. The
    // crosshair already follows the cursor, so this clicks-to-fire-at-cursor.
    const m = k.mousePos();
    const r = areaRect(playArea);
    if (m.x < r.left || m.x > r.right || m.y < r.top || m.y > r.bottom) return;
    startLaunch();
  });

  k.onUpdate(() => {
    syncMobileAction();
    if (nvgCharge > 0) nvgCharge = Math.max(0, nvgCharge - k.dt());
    nvgPulse = Math.max(0, nvgPulse - k.dt());

    // Low-fuel alarm — beeps faster the closer you are to empty.
    if (mode === "drive" && fuel > 0 && fuel < FUEL_LOW) {
      alarmT -= k.dt();
      if (alarmT <= 0) {
        sfx.alarm();
        alarmT = 0.12 + (fuel / FUEL_LOW) * 0.5;
      }
    } else if (mode === "stall") {
      alarmT -= k.dt();
      if (alarmT <= 0) {
        sfx.alarm();
        alarmT = 0.2;
      }
    }

    const mouseNow = k.mousePos();
    const mouseMoved = mouseNow.dist(lastMouse) > 0.5;
    lastMouse = mouseNow.clone();
    const moveTaps = readMoveTapCount();
    slideCooldown = Math.max(0, slideCooldown - k.dt());
    wetShakeT = Math.max(0, wetShakeT - k.dt());
    wetTapFlash = Math.max(0, wetTapFlash - k.dt());
    if (comboTimer > 0) {
      comboTimer = Math.max(0, comboTimer - k.dt());
      if (comboTimer <= 0) comboCount = 0;
    }
    comboPulse = Math.max(0, comboPulse - k.dt());

    if (mode === "drive") {
      const { dx, dy } = readDir();
      const hasInput = dx !== 0 || dy !== 0;
      const dir = hasInput
        ? k.vec2(dx / Math.hypot(dx, dy), dy / Math.hypot(dx, dy))
        : k.vec2(0, 0);
      if (slideT > 0) {
        slideT = Math.max(0, slideT - k.dt());
        if (moveTaps > 0) {
          slideT = Math.max(0, slideT - WET_TAP_RECOVER * moveTaps);
          slideVel = slideVel.scale(Math.pow(WET_TAP_BRAKE, moveTaps));
          wetShakeT = 0.22;
          wetTapFlash = 0.35;
          sfx.shake();
        }
        if (hasInput) {
          slideVel = slideVel.add(dir.scale(WET_SLIDE_STEER * k.dt()));
          aim = dir;
          player.flipX = dx < 0;
        } else if (Math.abs(slideVel.x) > 8) {
          player.flipX = slideVel.x < 0;
        }
        slideVel = slideVel.scale(Math.max(0, 1 - WET_SLIDE_DRAG * k.dt()));
        tryMove(slideVel.x * k.dt(), slideVel.y * k.dt());
        if (slideVel.len() < 20 && slideT < 0.35) slideT = 0;
      } else if (hasInput) {
        const speed = PLAYER_SPEED * (onFlowerbed() ? FLOWER_SLOW : 1);
        tryMove(dir.x * speed * k.dt(), dir.y * speed * k.dt());
        player.flipX = dx < 0;
        aim = dir;
        if (onWetGrass() && slideCooldown <= 0) {
          slideT = WET_SLIDE_TIME;
          slideCooldown = WET_SLIDE_TIME + 0.25;
          slideVel = dir.scale(WET_SLIDE_SPEED);
          sfx.slide();
        }
      }
      if (mowAt(player.pos.x, player.pos.y)) {
        sfx.mow();
        if (toMow <= 0) {
          winLevel();
          return;
        }
      }
      fuel -= FUEL_BURN * k.dt();
      if (fuel <= 0) {
        fuel = 0;
        mode = "stall"; // out of fuel — line up a bail-out
        resetAimTarget();
        alarmT = 0;
      }
    } else if (mode === "stall") {
      const { dx, dy } = readDir();
      let target = aimTarget ?? clampPointToArea(playArea, player.pos.add(aim.scale(96)), 12);
      if (dx !== 0 || dy !== 0) {
        const len = Math.hypot(dx, dy);
        target = clampPointToArea(
          playArea,
          target.add(k.vec2(dx / len, dy / len).scale(AIM_CURSOR_SPEED * k.dt())),
          12,
        );
        player.flipX = dx < 0;
      }
      const rect = areaRect(playArea);
      if (
        mouseMoved &&
        mouseNow.x >= rect.left &&
        mouseNow.x <= rect.right &&
        mouseNow.y >= rect.top &&
        mouseNow.y <= rect.bottom
      ) {
        target = clampPointToArea(playArea, mouseNow, 12);
      }
      aimTarget = target;
      updateAimFromTarget();
    } else if (mode === "launch") {
      const prev = player.pos.clone();
      const step = launchDir.scale(LAUNCH_SPEED * k.dt());
      const half = 10;
      const rect = areaRect(playArea);
      const nx = player.pos.x + step.x;
      const ny = player.pos.y + step.y;
      const cx = k.clamp(nx, rect.left + half, rect.right - half);
      const cy = k.clamp(ny, rect.top + half, rect.bottom - half);
      const hitWall = cx !== nx || cy !== ny;
      player.pos.x = cx;
      player.pos.y = cy;
      player.flipX = launchDir.x < 0;

      // Mow a stripe along the flight path (sample so we don't skip tiles).
      const segs = Math.max(1, Math.ceil(prev.dist(player.pos) / 12));
      for (let i = 1; i <= segs; i++) {
        const sx = prev.x + ((player.pos.x - prev.x) * i) / segs;
        const sy = prev.y + ((player.pos.y - prev.y) * i) / segs;
        if (mowAt(sx, sy) && toMow <= 0) {
          winLevel();
          return;
        }
      }
      // Grab any fuel can we fly over.
      for (const can of k.get("fuel")) {
        if (player.pos.dist(can.pos) < 24) grabFuel(can);
      }
      for (const goggles of k.get("nvg")) {
        if (player.pos.dist(goggles.pos) < 24) grabNvg(goggles);
      }
      for (const point of k.get("point")) {
        if (player.pos.dist(point.pos) < 22) grabPoint(point);
      }

      launchDist += step.len();
      if (fuel > 0) endLaunch(true);
      else if (hitWall || launchDist > 800) endLaunch(false);
    }

    // Flashing: urgent while stalled/crashing, grace flash while invulnerable.
    if (mode === "stall" || mode === "crash") {
      player.opacity = Math.floor(k.time() * 12) % 2 ? 0.35 : 1;
    } else if (invuln > 0) {
      if (mode !== "launch") invuln -= k.dt();
      player.opacity = Math.floor(k.time() * 10) % 2 ? 0.4 : 1;
    } else {
      player.opacity = 1;
    }

    if (mode === "drive" && wetShakeT > 0) {
      const shake = Math.sin(k.time() * 58) * 3 * (wetShakeT / 0.22);
      player.angle = shake;
    } else if (player.angle !== 0) {
      player.angle = 0;
    }
  });

  // --- Enemies --------------------------------------------------------------
  const loseLife = (reason: string, resetPos: () => void) => {
    if (invuln > 0 || mode !== "drive") return false;
    if (lives > 1) dropScore(player.pos.clone());
    lives--;
    sfx.hit();
    haptic([0, 80, 40, 80]);
    k.shake(8);
    invuln = 2;
    resetCombo();
    slideT = 0;
    slideVel = k.vec2(0, 0);
    player.pos = playerStart();
    resetAimTarget();
    resetPos();
    if (lives <= 0) {
      sfx.lose();
      k.go("lose", { score, reason });
    }
    return true;
  };

  // Dog (daytime levels only).
  if (cfg.hasDog) {
    const dogStart = () =>
      tileCenter(playArea.c0 + playArea.cols - 1, playArea.r0 + playArea.rows - 1);
    const dogHome = dogStart();
    const dog = k.add([
      k.sprite("dog", { anim: "run" }),
      k.pos(dogHome.x, dogHome.y),
      k.anchor("center"),
      k.scale(2),
      k.area({ scale: 0.6 }),
      k.z(5),
      "dog",
    ]);
    const wakeDog = () => {
      dogAwake = false;
      k.wait(cfg.dogDelay, () => (dogAwake = true));
    };
    wakeDog();
    dog.onUpdate(() => {
      if (!dogAwake) return;
      const dir = player.pos.sub(dog.pos);
      if (dir.len() > 1) {
        const step = dir.unit().scale(DOG_SPEED * k.dt());
        dog.pos = dog.pos.add(step);
        dog.flipX = step.x < 0;
      }
    });
    player.onCollide("dog", () =>
      loseLife("The dog finally caught you!", () => {
        dog.pos = dogStart();
        wakeDog();
      }),
    );
  }

  // Angry neighbour (boss — levels 2 and 3).
  if (cfg.hasNeighbor) {
    const bossStart = () => tileCenter(playArea.c0 + playArea.cols - 1, playArea.r0);
    const bossHome = bossStart();
    const boss = k.add([
      k.sprite("neighbor", { anim: "stomp" }),
      k.pos(bossHome.x, bossHome.y),
      k.anchor("center"),
      k.scale(2),
      k.area({ scale: 0.55 }),
      k.z(5),
      "neighbor",
    ]);
    player.onCollide("neighbor", () =>
      loseLife("Gertrude grabbed you by the collar!", () => {
        boss.pos = bossStart();
      }),
    );

    if (!cfg.night) {
      // Daytime: simple relentless chase.
      boss.onUpdate(() => {
        const dir = player.pos.sub(boss.pos);
        if (dir.len() > 1) {
          const step = dir.unit().scale(NEIGHBOR_SPEED * k.dt());
          boss.pos = boss.pos.add(step);
          boss.flipX = step.x < 0;
        }
      });
    } else {
      // Night: torch + line-of-sight stealth.
      setupNightBoss(boss, player, isTree, getNightVision);
    }
  }

  if (cfg.hasLaserDrone) {
    const droneStart = tileCenter(
      playArea.c0 + Math.floor(playArea.cols / 2),
      playArea.r0,
    );
    const drone = k.add([
      k.sprite("drone", { anim: "hover" }),
      k.pos(droneStart.x, droneStart.y - 8),
      k.anchor("center"),
      k.scale(2),
      k.z(6),
      "drone",
    ]);
    setupLaserDrone(drone, player, playArea, loseLife, getNightVision);
  }

  // --- Fuel cans ------------------------------------------------------------
  const randomPickupTile = () => {
    let c = playArea.c0;
    let r = playArea.r0;
    for (let tries = 0; tries < 24; tries++) {
      c = k.randi(playArea.c0, playArea.c0 + playArea.cols);
      r = k.randi(playArea.r0, playArea.r0 + playArea.rows);
      if (!isTree(c, r) && !isFlowerbed(c, r)) break;
    }
    return { c, r };
  };

  const spawnFuel = () => {
    const { c, r } = randomPickupTile();
    k.add([
      k.sprite("fuel"),
      k.pos(c * TILE + TILE / 2, HUD_H + r * TILE + TILE / 2),
      k.anchor("center"),
      k.scale(1.5),
      k.area({ scale: 0.7 }),
      k.opacity(1),
      k.z(3),
      k.lifespan(5, { fade: 0.5 }),
      "fuel",
    ]);
  };
  k.loop(FUEL_SPAWN_EVERY, spawnFuel);
  k.wait(1.5, spawnFuel);

  const spawnNvg = () => {
    if (!cfg.night || k.get("nvg").length > 0) return;
    const { c, r } = randomPickupTile();
    const goggles: any = k.add([
      k.sprite("nvg"),
      k.pos(c * TILE + TILE / 2, HUD_H + r * TILE + TILE / 2),
      k.anchor("center"),
      k.scale(1.5),
      k.area({ scale: 0.7 }),
      k.rotate(0),
      k.opacity(1),
      k.z(3),
      k.lifespan(NVG_PICKUP_LIFETIME, { fade: 0.8 }),
      "nvg",
    ]);
    goggles.homeY = goggles.pos.y;
    const phase = Math.random() * Math.PI * 2;
    goggles.onUpdate(() => {
      goggles.pos.y = goggles.homeY + Math.sin(k.time() * 3.2 + phase) * 2;
      goggles.angle = Math.sin(k.time() * 4.5 + phase) * 6;
      goggles.opacity = 0.75 + Math.abs(Math.sin(k.time() * 5 + phase)) * 0.25;
    });
  };
  if (cfg.night) {
    k.loop(NVG_SPAWN_EVERY, spawnNvg);
    k.wait(2.5, spawnNvg);
  }
  player.onCollide("fuel", (can: any) => grabFuel(can));
  player.onCollide("nvg", (goggles: any) => grabNvg(goggles));
  player.onCollide("point", (point: any) => grabPoint(point));

  // --- HUD ------------------------------------------------------------------
  k.add([k.rect(GAME_W, HUD_H), k.color(20, 30, 48), k.pos(0, 0), k.z(20)]);
  const scoreLabel = k.add([
    k.text("", { size: 14 }),
    k.pos(8, 6),
    k.color(...C.yellow),
    k.z(21),
  ]);
  const livesLabel = k.add([
    k.text("", { size: 14 }),
    k.pos(8, 22),
    k.color(...C.red),
    k.z(21),
  ]);
  k.add([
    k.text(`LEVEL ${level}`, { size: 14 }),
    k.anchor("top"),
    k.pos(GAME_W / 2, 6),
    k.color(...C.white),
    k.z(21),
  ]);
  const comboLabel = k.add([
    k.text("", { size: 10 }),
    k.anchor("top"),
    k.pos(GAME_W / 2, 22),
    k.color(...C.yellow),
    k.z(21),
  ]);
  const COMBO_W = 92;
  const comboBg = k.add([
    k.rect(COMBO_W + 4, 5),
    k.color(40, 40, 50),
    k.pos(GAME_W / 2 - COMBO_W / 2 - 2, 34),
    k.opacity(0),
    k.z(21),
  ]);
  const comboBar = k.add([
    k.rect(0, 3),
    k.color(...C.yellow),
    k.pos(GAME_W / 2 - COMBO_W / 2, 35),
    k.opacity(0),
    k.z(22),
  ]);
  const mownLabel = k.add([
    k.text("", { size: 14 }),
    k.anchor("topright"),
    k.pos(GAME_W - 8, 6),
    k.color(...C.green),
    k.z(21),
  ]);
  const FB_X = GAME_W - 124;
  const FB_W = 116;
  k.add([k.rect(FB_W + 4, 12), k.color(40, 40, 50), k.pos(FB_X - 2, 22), k.z(21)]);
  const fuelBar = k.add([
    k.rect(FB_W, 8),
    k.color(...C.green),
    k.pos(FB_X, 24),
    k.z(22),
  ]);
  const NVG_HUD_X = 116;
  const NVG_HUD_W = 58;
  const nvgLabel = cfg.night
    ? k.add([
        k.text("NVG", { size: 8 }),
        k.pos(NVG_HUD_X - 27, 25),
        k.color(...C.grey),
        k.z(21),
      ])
    : null;
  if (cfg.night) {
    k.add([
      k.rect(NVG_HUD_W + 4, 6),
      k.color(22, 34, 38),
      k.pos(NVG_HUD_X - 2, 26),
      k.opacity(0.9),
      k.z(21),
    ]);
  }
  const nvgBar = cfg.night
    ? k.add([
        k.rect(0, 4),
        k.color(...C.green),
        k.pos(NVG_HUD_X, 27),
        k.opacity(0.35),
        k.z(22),
      ])
    : null;
  k.onUpdate(() => {
    scoreLabel.text = `SCORE ${score}`;
    livesLabel.text = `LIVES ${lives}`;
    const pct = Math.round(((totalToMow - toMow) / totalToMow) * 100);
    mownLabel.text = `MOWN ${pct}%`;
    fuelBar.width = (fuel / FUEL_MAX) * FB_W;
    fuelBar.color = fuel < FUEL_LOW ? k.rgb(...C.red) : k.rgb(...C.green);
    if (nvgBar && nvgLabel) {
      const frac = Math.min(1, nvgCharge / NVG_CHARGE_MAX);
      const active = nvgActive();
      nvgBar.width = frac * NVG_HUD_W;
      nvgBar.opacity = active ? 1 : 0.25;
      nvgBar.color =
        nvgPulse > 0
          ? k.rgb(...C.white)
          : frac > 0 && frac < 0.25
            ? k.rgb(...C.yellow)
            : active
              ? k.rgb(44, 255, 107)
              : k.rgb(...C.grey);
      nvgLabel.color = active ? k.rgb(44, 255, 107) : k.rgb(...C.grey);
    }
    if (comboCount > 1 && comboTimer > 0) {
      const mult = comboMultFor();
      comboLabel.text = `${comboCount} CHAIN  x${mult}`;
      comboBg.opacity = 1;
      comboBar.opacity = 1;
      comboLabel.color =
        comboPulse > 0
          ? k.rgb(...C.white)
          : mult >= 4
            ? k.rgb(...C.red)
            : k.rgb(...C.yellow);
      comboBar.width = (comboTimer / COMBO_WINDOW) * COMBO_W;
      comboBar.color = mult >= 4 ? k.rgb(...C.red) : k.rgb(...C.yellow);
    } else {
      comboLabel.text = "";
      comboBar.width = 0;
      comboBg.opacity = 0;
      comboBar.opacity = 0;
    }
  });

  k.onDraw(() => {
    if (wetTapFlash <= 0) return;
    const flash = wetTapFlash / 0.35;
    const pulse = Math.sin(k.time() * 46) * 2;

    k.drawCircle({
      pos: player.pos,
      radius: 14 + (1 - flash) * 14,
      color: k.rgb(72, 202, 228),
      opacity: 0.14 * flash,
    });

    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8 + k.time() * 0.35;
      const dist = 12 + (1 - flash) * 22 + (i % 2) * 4;
      const dropPos = player.pos.add(
        k.vec2(Math.cos(angle) * dist, Math.sin(angle) * dist * 0.7 + pulse),
      );
      k.drawCircle({
        pos: dropPos,
        radius: 1.5 + (i % 3) * 0.5,
        color: k.rgb(172, 232, 255),
        opacity: 0.75 * flash,
      });
    }
  });

  // --- Bail-out aim UI (registered last, so it draws over night darkness) ---
  k.onDraw(() => {
    if (mode !== "stall") return;
    const tip = aimTarget ?? player.pos.add(aim.scale(80));
    const toTip = tip.sub(player.pos);
    const dir = toTip.len() > 1 ? toTip.unit() : aim;
    k.drawLine({
      p1: player.pos,
      p2: tip,
      width: 2,
      color: k.rgb(...C.yellow),
      opacity: 0.75,
    });
    k.drawCircle({
      pos: tip,
      radius: 12,
      color: k.rgb(255, 210, 63),
      opacity: 0.22,
    });
    k.drawLine({
      p1: tip.add(k.vec2(-16, 0)),
      p2: tip.add(k.vec2(16, 0)),
      width: 2,
      color: k.rgb(...C.yellow),
    });
    k.drawLine({
      p1: tip.add(k.vec2(0, -16)),
      p2: tip.add(k.vec2(0, 16)),
      width: 2,
      color: k.rgb(...C.yellow),
    });
    const back = dir.scale(-14);
    const perp = k.vec2(-dir.y, dir.x).scale(9);
    k.drawTriangle({
      p1: tip,
      p2: tip.add(back).add(perp),
      p3: tip.add(back).sub(perp),
      color: k.rgb(...C.yellow),
    });
    k.drawRect({
      pos: k.vec2(82, HUD_H + 6),
      width: GAME_W - 164,
      height: 42,
      color: k.rgb(8, 14, 24),
      opacity: 0.82,
      outline: { width: 1, color: k.rgb(...C.yellow) },
    });
    k.drawText({
      text: "BOOT LAUNCH",
      pos: k.vec2(GAME_W / 2, HUD_H + 14),
      size: 14,
      anchor: "center",
      color: Math.floor(k.time() * 4) % 2 ? k.rgb(...C.red) : k.rgb(...C.white),
    });
    k.drawText({
      text: "aim target  -  SPACE / GO to fire",
      pos: k.vec2(GAME_W / 2, HUD_H + 34),
      size: 10,
      anchor: "center",
      color: k.rgb(...C.white),
    });
  });
});

// ============================================================================
// CUTSCENE — the angry neighbour bursts in (animated)
// ============================================================================

k.scene("cutscene", (data: { score: number; lives: number }) => {
  bgFill();
  sfx.boss();
  k.shake(16);

  k.add([
    k.text("BUSTED!", { size: 40 }),
    k.anchor("center"),
    k.pos(GAME_W / 2, 70),
    k.color(...C.red),
  ]);

  // Neighbour pops up from nothing, wobbling with rage.
  const boss = k.add([
    k.sprite("neighbor", { anim: "stomp" }),
    k.anchor("center"),
    k.pos(GAME_W / 2, GAME_H / 2 + 10),
    k.scale(0),
    k.rotate(0),
    k.z(5),
  ]);
  // grow in
  k.tween(0, 5, 0.7, (s) => (boss.scale = k.vec2(s)));
  // keep wobbling angrily after the grow-in
  boss.onUpdate(() => {
    boss.angle = Math.sin(k.time() * 22) * 5;
  });

  k.wait(0.8, () => {
    k.add([
      k.text("Gertrude saw EVERYTHING.\nNow she wants her mower back —\nand she's coming for you!", {
        size: 14,
        align: "center",
        lineSpacing: 6,
      }),
      k.anchor("center"),
      k.pos(GAME_W / 2, GAME_H - 80),
      k.color(...C.white),
    ]);
    const hint = k.add([
      k.text("press SPACE or GO to keep mowing!", { size: 13 }),
      k.anchor("center"),
      k.pos(GAME_W / 2, GAME_H - 26),
      k.color(...C.yellow),
      k.opacity(1),
    ]);
    hint.onUpdate(() => {
      hint.opacity = Math.floor(k.time() * 2) % 2 ? 0.3 : 1;
    });
  });

  // Ignore input briefly so a stray click/keypress doesn't skip the scene.
  let ready = false;
  k.wait(0.6, () => (ready = true));
  const go = () => {
    if (!ready) return;
    k.go("game", { level: 2, score: data.score, lives: data.lives });
  };
  mobileControls.setAction(go, "GO");
  k.onKeyPress("space", go);
  k.onClick(go);
});

// ============================================================================
// NIGHTFALL — transition into the night stealth level
// ============================================================================

k.scene("nightfall", (data: { score: number; lives: number }) => {
  bgFill();

  k.add([
    k.circle(16),
    k.pos(GAME_W / 2, 84),
    k.color(238, 232, 190),
    k.opacity(0.9),
  ]);
  k.add([
    k.text("NIGHT FALLS", { size: 34 }),
    k.anchor("center"),
    k.pos(GAME_W / 2, 150),
    k.color(...C.white),
  ]);
  k.add([
    k.text(
      "It's pitch dark now — but Gertrude is still\n" +
        "out there, and she's got a TORCH.\n\n" +
        "Stay out of her beam. Duck behind the trees\n" +
        "for cover. Grab NVG goggles to see farther.",
      { size: 14, align: "center", lineSpacing: 6 },
    ),
    k.anchor("center"),
    k.pos(GAME_W / 2, GAME_H / 2 + 30),
    k.color(...C.grey),
  ]);
  const hint = k.add([
    k.text("press SPACE or GO to sneak out", { size: 13 }),
    k.anchor("center"),
    k.pos(GAME_W / 2, GAME_H - 26),
    k.color(...C.yellow),
    k.opacity(1),
  ]);
  hint.onUpdate(() => {
    hint.opacity = Math.floor(k.time() * 2) % 2 ? 0.3 : 1;
  });

  let ready = false;
  k.wait(0.6, () => (ready = true));
  const go = () => {
    if (ready) k.go("game", { level: 3, score: data.score, lives: data.lives });
  };
  mobileControls.setAction(go, "GO");
  k.onKeyPress("space", go);
  k.onClick(go);
});

// ============================================================================
// LASERFALL — transition into the second night / drone level
// ============================================================================

k.scene("laserfall", (data: { score: number; lives: number }) => {
  bgFill();
  sfx.boss();

  k.add([
    k.circle(16),
    k.pos(GAME_W / 2, 70),
    k.color(238, 232, 190),
    k.opacity(0.85),
  ]);
  const drone = k.add([
    k.sprite("drone", { anim: "hover" }),
    k.anchor("center"),
    k.pos(GAME_W / 2, 126),
    k.scale(3),
    k.rotate(0),
    k.z(3),
  ]);
  drone.onUpdate(() => {
    drone.pos.y = 126 + Math.sin(k.time() * 5) * 4;
    drone.angle = Math.sin(k.time() * 3) * 4;
  });

  k.add([
    k.text("THE SECOND NIGHT", { size: 30 }),
    k.anchor("center"),
    k.pos(GAME_W / 2, 185),
    k.color(...C.red),
  ]);
  k.add([
    k.text(
      "Gertrude called in her garden security drone.\n\n" +
        "It paints whole rows and columns before firing.\n" +
        "Move when the warning line appears. NVG charge\n" +
        "helps in the dark, but the drone lasts longer now.",
      { size: 14, align: "center", lineSpacing: 6 },
    ),
    k.anchor("center"),
    k.pos(GAME_W / 2, GAME_H / 2 + 58),
    k.color(...C.grey),
  ]);
  const hint = k.add([
    k.text("press SPACE or GO for the final night", { size: 13 }),
    k.anchor("center"),
    k.pos(GAME_W / 2, GAME_H - 26),
    k.color(...C.yellow),
    k.opacity(1),
  ]);
  hint.onUpdate(() => {
    hint.opacity = Math.floor(k.time() * 2) % 2 ? 0.3 : 1;
  });

  let ready = false;
  k.wait(0.6, () => (ready = true));
  const go = () => {
    if (ready) k.go("game", { level: 4, score: data.score, lives: data.lives });
  };
  mobileControls.setAction(go, "GO");
  k.onKeyPress("space", go);
  k.onClick(go);
});

// ============================================================================
// WIN / LOSE
// ============================================================================

function endScene(
  name: string,
  title: string,
  color: readonly [number, number, number],
) {
  k.scene(name, (data: { score: number; reason?: string }) => {
    bgFill();
    k.add([
      k.text(title, { size: 36 }),
      k.anchor("center"),
      k.pos(GAME_W / 2, GAME_H / 2 - 70),
      k.color(...color),
    ]);
    if (data.reason) {
      k.add([
        k.text(data.reason, { size: 14, align: "center", width: GAME_W - 60 }),
        k.anchor("center"),
        k.pos(GAME_W / 2, GAME_H / 2 - 15),
        k.color(...C.grey),
      ]);
    }
    const prevBest = getHiScore();
    const best = recordScore(data.score);
    const isNewBest = data.score > prevBest && data.score > 0;
    k.add([
      k.text(`Score: ${data.score}`, { size: 20 }),
      k.anchor("center"),
      k.pos(GAME_W / 2, GAME_H / 2 + 24),
      k.color(...C.yellow),
    ]);
    const bestTone: readonly [number, number, number] = isNewBest
      ? C.green
      : C.grey;
    k.add([
      k.text(isNewBest ? "NEW BEST!" : `Best: ${best}`, { size: 14 }),
      k.anchor("center"),
      k.pos(GAME_W / 2, GAME_H / 2 + 50),
      k.color(...bestTone),
    ]);
    if (isNewBest) haptic([0, 60, 50, 60, 50, 120]);
    k.add([
      k.text("press SPACE or GO to play again", { size: 13 }),
      k.anchor("center"),
      k.pos(GAME_W / 2, GAME_H / 2 + 80),
      k.color(...C.white),
    ]);
    // Ignore input briefly so the click/keypress that ended the round
    // doesn't immediately skip this screen.
    let ready = false;
    k.wait(0.6, () => (ready = true));
    const restart = () => {
      if (ready) k.go("story");
    };
    mobileControls.setAction(restart, "AGAIN");
    k.onKeyPress("space", restart);
    k.onClick(restart);
  });
}

endScene("win", "LAWN LEGEND!", C.green);
endScene("lose", "GAME OVER", C.red);

// ============================================================================
// TWO PLAYER — shared screen, versus or co-op
// ============================================================================

const P2_COLOR = [255, 93, 143] as const;
const TWOP_TREES: [number, number][] = [
  [3, 2],
  [11, 2],
  [7, 4],
  [2, 7],
  [12, 7],
  [7, 8],
];
const TWOP_TIME = 120; // seconds backstop

type Keys = { up: string[]; down: string[]; left: string[]; right: string[] };
type Pl = {
  ent: any;
  keys: Keys;
  id: number;
  stun: number;
  score: number;
};

k.scene("twoplayer", (opts: { coop: boolean }) => {
  const coop = opts.coop;
  mobileControls.setAction(null, "GO");

  const trees = new Set<string>();
  for (const [c, r] of TWOP_TREES) trees.add(`${c},${r}`);
  const isTree = (c: number, r: number) => trees.has(`${c},${r}`);

  // Lawn. owner: 0 = unmown, 1 = P1, 2 = P2, -1 = tree.
  const grass: any[][] = [];
  const owner: number[][] = [];
  let toMow = 0;
  for (let r = 0; r < ROWS; r++) {
    grass[r] = [];
    owner[r] = [];
    for (let c = 0; c < COLS; c++) {
      const x = c * TILE;
      const y = HUD_H + r * TILE;
      if (isTree(c, r)) {
        k.add([k.sprite("mown"), k.pos(x, y), k.scale(2), k.z(0)]);
        k.add([k.sprite("tree"), k.pos(x, y), k.scale(2), k.z(2), "tree"]);
        owner[r][c] = -1;
        continue;
      }
      grass[r][c] = k.add([k.sprite("grass"), k.pos(x, y), k.scale(2), k.z(0)]);
      owner[r][c] = 0;
      toMow++;
    }
  }
  const total = toMow;

  const mkPlayer = (
    sprite: string,
    x: number,
    y: number,
    keys: Keys,
    id: number,
  ): Pl => ({
    ent: k.add([
      k.sprite(sprite, { anim: "hover" }),
      k.pos(x, y),
      k.anchor("center"),
      k.scale(2),
      k.area({ scale: 0.6 }),
      k.opacity(1),
      k.z(5),
      "pl",
    ]),
    keys,
    id,
    stun: 0,
    score: 0,
  });

  const p1 = mkPlayer("player", TILE * 0.5, HUD_H + TILE * 0.5, {
    up: ["w"],
    down: ["s"],
    left: ["a"],
    right: ["d"],
  }, 1);
  // P2 can use the arrow keys OR IJKL (handy on 60% keyboards where the
  // arrows need an Fn chord).
  const p2 = mkPlayer("player2", GAME_W - TILE * 0.5, GAME_H - TILE * 0.5, {
    up: ["up", "i"],
    down: ["down", "k"],
    left: ["left", "j"],
    right: ["right", "l"],
  }, 2);
  const players = [p1, p2];

  const moveP = (p: Pl, dx: number, dy: number) => {
    const move = (nx: number, ny: number) => {
      const half = 10;
      nx = k.clamp(nx, half, GAME_W - half);
      ny = k.clamp(ny, HUD_H + half, GAME_H - half);
      for (const [ox, oy] of [
        [-half, -half],
        [half, -half],
        [-half, half],
        [half, half],
      ]) {
        const t = tileAt(nx + ox, ny + oy);
        if (inBounds(t.c, t.r) && isTree(t.c, t.r)) return false;
      }
      return { nx, ny };
    };
    const rx = move(p.ent.pos.x + dx, p.ent.pos.y);
    if (rx) p.ent.pos.x = rx.nx;
    const ry = move(p.ent.pos.x, p.ent.pos.y + dy);
    if (ry) p.ent.pos.y = ry.ny;
  };

  let over = false;
  let elapsed = 0;
  const finish = () => {
    if (over) return;
    over = true;
    k.go("result2p", {
      coop,
      s1: p1.score,
      s2: p2.score,
      total,
      time: Math.round(elapsed),
      cleared: toMow <= 0,
    });
  };

  k.onUpdate(() => {
    if (over) return;
    elapsed += k.dt();
    for (const p of players) {
      if (p.stun > 0) {
        p.stun -= k.dt();
        p.ent.opacity = Math.floor(k.time() * 12) % 2 ? 0.3 : 1;
        continue;
      }
      p.ent.opacity = 1;
      let dx = 0;
      let dy = 0;
      if (p.keys.left.some((kk) => k.isKeyDown(kk as any))) dx -= 1;
      if (p.keys.right.some((kk) => k.isKeyDown(kk as any))) dx += 1;
      if (p.keys.up.some((kk) => k.isKeyDown(kk as any))) dy -= 1;
      if (p.keys.down.some((kk) => k.isKeyDown(kk as any))) dy += 1;
      if (p.id === 1) {
        const mobile = mobileControls.direction();
        dx += mobile.x;
        dy += mobile.y;
        mobileControls.consumeMoveTaps();
      }
      if (dx !== 0 || dy !== 0) {
        const l = Math.hypot(dx, dy);
        moveP(p, (dx / l) * PLAYER_SPEED * k.dt(), (dy / l) * PLAYER_SPEED * k.dt());
        p.ent.flipX = dx < 0;
      }
      const t = tileAt(p.ent.pos.x, p.ent.pos.y);
      if (inBounds(t.c, t.r) && owner[t.r][t.c] === 0) {
        owner[t.r][t.c] = coop ? 1 : p.id;
        k.destroy(grass[t.r][t.c]);
        const spr = !coop && p.id === 2 ? "mown2" : "mown";
        k.add([k.sprite(spr), k.pos(t.c * TILE, HUD_H + t.r * TILE), k.scale(2), k.z(0)]);
        p.score += 10;
        toMow--;
        sfx.mow();
        if (toMow <= 0) finish();
      }
    }
    if (elapsed >= TWOP_TIME) finish();
  });

  // Dog chases the nearest player and stuns on contact (no lives in 2P).
  const dog = k.add([
    k.sprite("dog", { anim: "run" }),
    k.pos(GAME_W / 2, HUD_H + TILE * 3),
    k.anchor("center"),
    k.scale(2),
    k.area({ scale: 0.6 }),
    k.z(5),
    "dog",
  ]);
  let dogAwake = false;
  k.wait(2.5, () => (dogAwake = true));
  dog.onUpdate(() => {
    if (!dogAwake || over) return;
    const target =
      p1.ent.pos.dist(dog.pos) <= p2.ent.pos.dist(dog.pos) ? p1 : p2;
    const dir = target.ent.pos.sub(dog.pos);
    if (dir.len() > 1) {
      const step = dir.unit().scale(DOG_SPEED * 0.9 * k.dt());
      dog.pos = dog.pos.add(step);
      dog.flipX = step.x < 0;
    }
  });
  const stun = (p: Pl) => {
    if (p.stun > 0) return;
    p.stun = 1.3;
    sfx.hit();
    k.shake(6);
    dog.pos = k.vec2(GAME_W / 2, HUD_H + TILE * 3);
  };
  p1.ent.onCollide("dog", () => stun(p1));
  p2.ent.onCollide("dog", () => stun(p2));

  // HUD
  k.add([k.rect(GAME_W, HUD_H), k.color(20, 30, 48), k.pos(0, 0), k.z(20)]);
  const l1 = k.add([
    k.text("", { size: 16 }),
    k.pos(8, 12),
    k.color(...C.green),
    k.z(21),
  ]);
  const mid = k.add([
    k.text("", { size: 13 }),
    k.anchor("top"),
    k.pos(GAME_W / 2, 6),
    k.color(...C.white),
    k.z(21),
  ]);
  const l2 = k.add([
    k.text("", { size: 16 }),
    k.anchor("topright"),
    k.pos(GAME_W - 8, 12),
    k.color(...P2_COLOR),
    k.z(21),
  ]);
  k.onUpdate(() => {
    if (coop) {
      l1.text = `MOWN ${total - toMow}/${total}`;
      l2.text = `${Math.round(elapsed)}s`;
      mid.text = "CO-OP";
    } else {
      l1.text = `P1  ${p1.score}`;
      l2.text = `P2  ${p2.score}`;
      mid.text = "VERSUS";
    }
  });

  k.add([
    k.text("P1: WASD     P2: arrows or IJKL", { size: 11 }),
    k.anchor("bot"),
    k.pos(GAME_W / 2, GAME_H - 4),
    k.color(...C.grey),
    k.z(21),
  ]);
});

// ============================================================================
// TWO PLAYER RESULT
// ============================================================================

k.scene(
  "result2p",
  (d: {
    coop: boolean;
    s1: number;
    s2: number;
    total: number;
    time: number;
    cleared: boolean;
  }) => {
    bgFill();

    let title: string;
    let titleColor: readonly [number, number, number];
    const lines: { text: string; color: readonly [number, number, number] }[] = [];

    if (d.coop) {
      title = d.cleared ? "TEAMWORK!" : "TIME'S UP";
      titleColor = d.cleared ? C.green : C.red;
      lines.push({
        text: d.cleared
          ? `You cleared the lawn together in ${d.time}s.`
          : `You mowed ${Math.round((d.s1 + d.s2) / 10)}/${d.total} tiles in time.`,
        color: C.white,
      });
      lines.push({ text: `Combined score: ${d.s1 + d.s2}`, color: C.yellow });
    } else {
      title =
        d.s1 > d.s2 ? "PLAYER 1 WINS!" : d.s2 > d.s1 ? "PLAYER 2 WINS!" : "DRAW!";
      titleColor = d.s1 > d.s2 ? C.green : d.s2 > d.s1 ? P2_COLOR : C.white;
      lines.push({ text: `Player 1:  ${d.s1}`, color: C.green });
      lines.push({ text: `Player 2:  ${d.s2}`, color: P2_COLOR });
    }

    k.add([
      k.text(title, { size: 32 }),
      k.anchor("center"),
      k.pos(GAME_W / 2, GAME_H / 2 - 70),
      k.color(...titleColor),
    ]);
    lines.forEach((ln, i) => {
      k.add([
        k.text(ln.text, { size: 17 }),
        k.anchor("center"),
        k.pos(GAME_W / 2, GAME_H / 2 - 10 + i * 30),
        k.color(...ln.color),
      ]);
    });
    k.add([
      k.text("press SPACE or GO for the menu", { size: 13 }),
      k.anchor("center"),
      k.pos(GAME_W / 2, GAME_H / 2 + 80),
      k.color(...C.white),
    ]);

    let ready = false;
    k.wait(0.6, () => (ready = true));
    const back = () => {
      if (ready) k.go("menu");
    };
    mobileControls.setAction(back, "MENU");
    k.onKeyPress("space", back);
    k.onClick(back);
  },
);

k.go("loading");

// Dev-only hook so scenes can be jumped to while testing. Stripped from builds.
if ((import.meta as any).env?.DEV) {
  (window as any).go = (scene: string, data?: unknown) => k.go(scene, data);
}

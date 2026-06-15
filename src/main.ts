import kaplay from "kaplay";
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
const START_LIVES = 3;
const FUEL_SPAWN_EVERY = 6; // seconds

// Per-level setup: tree layout, how fast the dog wakes up, and which threats
// are active. Level 3 is a night stealth level: no dog, but the neighbour
// carries a torch and only spots you when you're in her beam with clear sight.
type LevelCfg = {
  trees: [number, number][];
  dogDelay: number;
  hasNeighbor: boolean;
  hasDog: boolean;
  night?: boolean;
};
const LEVELS: Record<number, LevelCfg> = {
  1: {
    trees: [
      [4, 2],
      [9, 3],
      [6, 6],
      [11, 8],
      [2, 8],
    ],
    dogDelay: 3,
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
    dogDelay: 0,
    hasNeighbor: true,
    hasDog: false,
    night: true,
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

for (const s of SPRITES) {
  k.loadSprite(s.name, s.data, { sliceX: s.sliceX, anims: s.anims ?? {} });
}

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
    k.text("press SPACE to skip", { size: 11 }),
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
    k.text("up / down to choose   -   SPACE to play", { size: 12 }),
    k.anchor("center"),
    k.pos(GAME_W / 2, GAME_H - 28),
    k.color(...C.grey),
  ]);

  const moveSel = (d: number) => {
    sel = (sel + d + items.length) % items.length;
    sfx.mow();
    refresh();
  };
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
    "You 'borrowed' it. Mow every lawn and slip\n" +
    "it back before she notices...\n\n" +
    "...but her dog already smells trouble.";

  const txt = k.add([
    k.text("", { size: 14, align: "center", lineSpacing: 6 }),
    k.anchor("center"),
    k.pos(GAME_W / 2, GAME_H / 2 + 10),
    k.color(...C.white),
  ]);

  const hint = k.add([
    k.text("press SPACE to start mowing", { size: 13 }),
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
  k.onKeyPress("space", advance);
  k.onClick(advance);
});

// --- Night boss: torch, line-of-sight detection, darkness rendering ---------

const TORCH_RANGE = 155;
const TORCH_HALF = 0.52; // half-angle of the beam (~30°)
const BOSS_PATROL = 46;
const BOSS_HUNT = 74;

function setupNightBoss(
  boss: any,
  player: any,
  isTree: (c: number, r: number) => boolean,
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
        k.drawCircle({ pos: player.pos, radius: 58, color: k.rgb(255, 255, 255) });
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
  });

  return { isHunting: () => hunting };
}

// ============================================================================
// GAME
// ============================================================================

type GameOpts = { level: number; score: number; lives: number };

k.scene("game", (opts: GameOpts) => {
  const level = opts.level;
  const cfg = LEVELS[level];
  let lives = opts.lives;
  let fuel = FUEL_MAX;
  let score = opts.score;
  let dogAwake = false;
  let invuln = 0;

  // --- Build the lawn -------------------------------------------------------
  const grass: any[][] = [];
  const mown: boolean[][] = [];
  const trees = new Set<string>();
  for (const [c, r] of cfg.trees) trees.add(`${c},${r}`);
  const isTree = (c: number, r: number) => trees.has(`${c},${r}`);

  let toMow = 0;
  for (let r = 0; r < ROWS; r++) {
    grass[r] = [];
    mown[r] = [];
    for (let c = 0; c < COLS; c++) {
      const x = c * TILE;
      const y = HUD_H + r * TILE;
      if (isTree(c, r)) {
        k.add([k.sprite("mown"), k.pos(x, y), k.scale(2), k.z(0)]);
        k.add([k.sprite("tree"), k.pos(x, y), k.scale(2), k.z(2), "tree"]);
        mown[r][c] = true;
        continue;
      }
      grass[r][c] = k.add([k.sprite("grass"), k.pos(x, y), k.scale(2), k.z(0)]);
      mown[r][c] = false;
      toMow++;
    }
  }
  const totalToMow = toMow;

  // --- Player ---------------------------------------------------------------
  const player = k.add([
    k.sprite("player", { anim: "hover" }),
    k.pos(TILE * 0.5, HUD_H + TILE * 0.5),
    k.anchor("center"),
    k.scale(2),
    k.area({ scale: 0.6 }),
    k.opacity(1),
    k.z(5),
    "player",
  ]);

  const tryMove = (dx: number, dy: number) => {
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
    const rx = move(player.pos.x + dx, player.pos.y);
    if (rx) player.pos.x = rx.nx;
    const ry = move(player.pos.x, player.pos.y + dy);
    if (ry) player.pos.y = ry.ny;
  };

  const winLevel = () => {
    sfx.level();
    if (level === 1) {
      k.go("cutscene", { score, lives }); // Gertrude bursts in -> level 2
    } else if (level === 2) {
      k.go("nightfall", { score, lives }); // night falls -> level 3
    } else {
      sfx.win();
      k.go("win", {
        score,
        reason: "You slipped the mower back. She never proved a thing.",
      });
    }
  };

  k.onUpdate(() => {
    let dx = 0;
    let dy = 0;
    if (k.isKeyDown("left") || k.isKeyDown("a")) dx -= 1;
    if (k.isKeyDown("right") || k.isKeyDown("d")) dx += 1;
    if (k.isKeyDown("up") || k.isKeyDown("w")) dy -= 1;
    if (k.isKeyDown("down") || k.isKeyDown("s")) dy += 1;
    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      tryMove(
        (dx / len) * PLAYER_SPEED * k.dt(),
        (dy / len) * PLAYER_SPEED * k.dt(),
      );
      player.flipX = dx < 0;
    }

    // Mow the tile under the mower.
    const t = tileAt(player.pos.x, player.pos.y);
    if (inBounds(t.c, t.r) && !mown[t.r][t.c]) {
      mown[t.r][t.c] = true;
      k.destroy(grass[t.r][t.c]);
      k.add([
        k.sprite("mown"),
        k.pos(t.c * TILE, HUD_H + t.r * TILE),
        k.scale(2),
        k.z(0),
      ]);
      score += 10;
      toMow--;
      sfx.mow();
      if (toMow <= 0) winLevel();
    }

    // Burn fuel.
    fuel -= FUEL_BURN * k.dt();
    if (fuel <= 0) {
      fuel = 0;
      sfx.lose();
      k.go("lose", { score, reason: "The mower spluttered out of fuel!" });
    }

    if (invuln > 0) {
      invuln -= k.dt();
      player.opacity = Math.floor(k.time() * 10) % 2 ? 0.4 : 1;
    } else {
      player.opacity = 1;
    }
  });

  // --- Enemies --------------------------------------------------------------
  const loseLife = (reason: string, resetPos: () => void) => {
    if (invuln > 0) return;
    lives--;
    sfx.hit();
    k.shake(8);
    invuln = 2;
    player.pos = k.vec2(TILE * 0.5, HUD_H + TILE * 0.5);
    resetPos();
    if (lives <= 0) {
      sfx.lose();
      k.go("lose", { score, reason });
    }
  };

  // Dog (daytime levels only).
  if (cfg.hasDog) {
    const dog = k.add([
      k.sprite("dog", { anim: "run" }),
      k.pos(GAME_W - TILE, GAME_H - TILE),
      k.anchor("center"),
      k.scale(2),
      k.area({ scale: 0.6 }),
      k.z(5),
      "dog",
    ]);
    k.wait(cfg.dogDelay, () => (dogAwake = true));
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
        dog.pos = k.vec2(GAME_W - TILE, GAME_H - TILE);
      }),
    );
  }

  // Angry neighbour (boss — levels 2 and 3).
  if (cfg.hasNeighbor) {
    const boss = k.add([
      k.sprite("neighbor", { anim: "stomp" }),
      k.pos(GAME_W - TILE, HUD_H + TILE),
      k.anchor("center"),
      k.scale(2),
      k.area({ scale: 0.55 }),
      k.z(5),
      "neighbor",
    ]);
    player.onCollide("neighbor", () =>
      loseLife("Gertrude grabbed you by the collar!", () => {
        boss.pos = k.vec2(GAME_W - TILE, HUD_H + TILE);
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
      setupNightBoss(boss, player, isTree);
    }
  }

  // --- Fuel cans ------------------------------------------------------------
  const spawnFuel = () => {
    let c = 0;
    let r = 0;
    let tries = 0;
    do {
      c = k.randi(0, COLS);
      r = k.randi(0, ROWS);
      tries++;
    } while (isTree(c, r) && tries < 20);
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
  player.onCollide("fuel", (can: any) => {
    fuel = Math.min(FUEL_MAX, fuel + FUEL_PICKUP);
    sfx.fuel();
    k.destroy(can);
  });

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
  k.onUpdate(() => {
    scoreLabel.text = `SCORE ${score}`;
    livesLabel.text = `LIVES ${lives}`;
    const pct = Math.round(((totalToMow - toMow) / totalToMow) * 100);
    mownLabel.text = `MOWN ${pct}%`;
    fuelBar.width = (fuel / FUEL_MAX) * FB_W;
    fuelBar.color = fuel < 25 ? k.rgb(...C.red) : k.rgb(...C.green);
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
      k.text("press SPACE to keep mowing!", { size: 13 }),
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
        "for cover and mow the last lawn unseen.",
      { size: 14, align: "center", lineSpacing: 6 },
    ),
    k.anchor("center"),
    k.pos(GAME_W / 2, GAME_H / 2 + 30),
    k.color(...C.grey),
  ]);
  const hint = k.add([
    k.text("press SPACE to sneak out", { size: 13 }),
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
    k.add([
      k.text(`Score: ${data.score}`, { size: 20 }),
      k.anchor("center"),
      k.pos(GAME_W / 2, GAME_H / 2 + 30),
      k.color(...C.yellow),
    ]);
    k.add([
      k.text("press SPACE to play again", { size: 13 }),
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
  const p2 = mkPlayer("player2", GAME_W - TILE * 0.5, GAME_H - TILE * 0.5, {
    up: ["up"],
    down: ["down"],
    left: ["left"],
    right: ["right"],
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
    k.text("P1: WASD     P2: arrows", { size: 11 }),
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
      k.text("press SPACE for the menu", { size: 13 }),
      k.anchor("center"),
      k.pos(GAME_W / 2, GAME_H / 2 + 80),
      k.color(...C.white),
    ]);

    let ready = false;
    k.wait(0.6, () => (ready = true));
    const back = () => {
      if (ready) k.go("menu");
    };
    k.onKeyPress("space", back);
    k.onClick(back);
  },
);

k.go("loading");

// Dev-only hook so scenes can be jumped to while testing. Stripped from builds.
if ((import.meta as any).env?.DEV) {
  (window as any).go = (scene: string, data?: unknown) => k.go(scene, data);
}

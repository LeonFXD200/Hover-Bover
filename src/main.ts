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
const FUEL_MAX = 100;
const FUEL_BURN = 3.5; // per second
const FUEL_PICKUP = 35;
const START_LIVES = 3;
const DOG_DELAY = 3; // seconds before the dog wakes up
const FUEL_SPAWN_EVERY = 6; // seconds

// --- Boot -------------------------------------------------------------------

const k = kaplay({
  canvas: document.getElementById("game") as HTMLCanvasElement,
  width: GAME_W,
  height: GAME_H,
  background: [13, 27, 42],
  crisp: true, // keep pixels sharp when CSS scales the canvas up
  pixelDensity: 1,
});

for (const s of SPRITES) k.loadSprite(s.name, s.data);

// Helper: which tile column/row a world point falls in.
const tileAt = (x: number, y: number) => ({
  c: Math.floor(x / TILE),
  r: Math.floor((y - HUD_H) / TILE),
});
const inBounds = (c: number, r: number) =>
  c >= 0 && c < COLS && r >= 0 && r < ROWS;

// ============================================================================
// MENU
// ============================================================================

k.scene("menu", () => {
  k.add([
    k.rect(GAME_W, GAME_H),
    k.color(13, 27, 42),
    k.pos(0, 0),
  ]);

  k.add([
    k.text("HOVER BOVER", { size: 40 }),
    k.anchor("center"),
    k.pos(GAME_W / 2, GAME_H / 2 - 70),
    k.color(63, 163, 77),
  ]);
  k.add([
    k.text("mow every lawn before the dog\nor the fuel gets you", {
      size: 14,
      align: "center",
    }),
    k.anchor("center"),
    k.pos(GAME_W / 2, GAME_H / 2),
    k.color(244, 244, 244),
  ]);
  k.add([
    k.text("arrows / WASD to move\n\npress SPACE to start", {
      size: 14,
      align: "center",
    }),
    k.anchor("center"),
    k.pos(GAME_W / 2, GAME_H / 2 + 70),
    k.color(141, 153, 174),
  ]);

  k.onKeyPress("space", () => k.go("game"));
  k.onClick(() => k.go("game"));
});

// ============================================================================
// GAME
// ============================================================================

k.scene("game", () => {
  let lives = START_LIVES;
  let fuel = FUEL_MAX;
  let score = 0;
  let dogAwake = false;
  let invuln = 0;

  // --- Build the lawn -------------------------------------------------------
  // grass[r][c] = the tile game object; mown[r][c] tracks cut state.
  const grass: any[][] = [];
  const mown: boolean[][] = [];
  const trees = new Set<string>();

  // Scatter a few trees (not in the player's spawn corner).
  const treeSpots: [number, number][] = [
    [4, 2],
    [9, 3],
    [6, 6],
    [11, 8],
    [2, 8],
  ];
  for (const [c, r] of treeSpots) trees.add(`${c},${r}`);

  let toMow = 0;
  for (let r = 0; r < ROWS; r++) {
    grass[r] = [];
    mown[r] = [];
    for (let c = 0; c < COLS; c++) {
      const x = c * TILE;
      const y = HUD_H + r * TILE;
      if (trees.has(`${c},${r}`)) {
        k.add([k.sprite("mown"), k.pos(x, y), k.scale(2), k.z(0)]);
        k.add([k.sprite("tree"), k.pos(x, y), k.scale(2), k.z(2), "tree"]);
        mown[r][c] = true;
        continue;
      }
      grass[r][c] = k.add([
        k.sprite("grass"),
        k.pos(x, y),
        k.scale(2),
        k.z(0),
      ]);
      mown[r][c] = false;
      toMow++;
    }
  }
  const totalToMow = toMow;

  const isTree = (c: number, r: number) => trees.has(`${c},${r}`);

  // --- Player ---------------------------------------------------------------
  const player = k.add([
    k.sprite("player"),
    k.pos(TILE * 0.5, HUD_H + TILE * 0.5),
    k.anchor("center"),
    k.scale(2),
    k.area({ scale: 0.6 }),
    k.opacity(1),
    k.z(5),
    "player",
  ]);

  // Axis-separated movement that refuses to enter tree tiles or leave bounds.
  const tryMove = (dx: number, dy: number) => {
    const move = (nx: number, ny: number) => {
      const half = 10;
      // clamp to playfield
      nx = k.clamp(nx, half, GAME_W - half);
      ny = k.clamp(ny, HUD_H + half, GAME_H - half);
      // block tree tiles (check the four corners of the player box)
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
      if (toMow <= 0) {
        sfx.win();
        k.go("win", { score });
      }
    }

    // Burn fuel.
    fuel -= FUEL_BURN * k.dt();
    if (fuel <= 0) {
      fuel = 0;
      sfx.lose();
      k.go("lose", { score, reason: "Out of fuel!" });
    }

    if (invuln > 0) {
      invuln -= k.dt();
      player.opacity = Math.floor(k.time() * 10) % 2 ? 0.4 : 1;
    } else {
      player.opacity = 1;
    }
  });

  // --- Dog ------------------------------------------------------------------
  const dog = k.add([
    k.sprite("dog"),
    k.pos(GAME_W - TILE, GAME_H - TILE),
    k.anchor("center"),
    k.scale(2),
    k.area({ scale: 0.6 }),
    k.z(5),
    "dog",
  ]);

  k.wait(DOG_DELAY, () => (dogAwake = true));

  dog.onUpdate(() => {
    if (!dogAwake) return;
    const dir = player.pos.sub(dog.pos);
    if (dir.len() > 1) {
      const step = dir.unit().scale(DOG_SPEED * k.dt());
      dog.pos = dog.pos.add(step);
      dog.flipX = step.x < 0;
    }
  });

  player.onCollide("dog", () => {
    if (invuln > 0) return;
    lives--;
    sfx.hit();
    k.shake(8);
    invuln = 2;
    // reset positions so the dog isn't sitting on the player
    player.pos = k.vec2(TILE * 0.5, HUD_H + TILE * 0.5);
    dog.pos = k.vec2(GAME_W - TILE, GAME_H - TILE);
    if (lives <= 0) {
      sfx.lose();
      k.go("lose", { score, reason: "The dog got you!" });
    }
  });

  // --- Fuel cans ------------------------------------------------------------
  const spawnFuel = () => {
    let c: number;
    let r: number;
    let tries = 0;
    do {
      c = k.randi(0, COLS);
      r = k.randi(0, ROWS);
      tries++;
    } while (isTree(c, r) && tries < 20);
    const can = k.add([
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
    return can;
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
    k.text("", { size: 16 }),
    k.pos(8, 12),
    k.color(255, 210, 63),
    k.z(21),
  ]);
  const livesLabel = k.add([
    k.text("", { size: 16 }),
    k.pos(150, 12),
    k.color(230, 57, 70),
    k.z(21),
  ]);
  const mownLabel = k.add([
    k.text("", { size: 16 }),
    k.anchor("topright"),
    k.pos(GAME_W - 8, 12),
    k.color(63, 163, 77),
    k.z(21),
  ]);

  // Fuel bar
  const FB_X = 250;
  const FB_W = 120;
  k.add([
    k.rect(FB_W + 4, 16),
    k.color(40, 40, 50),
    k.pos(FB_X - 2, 12),
    k.z(21),
  ]);
  const fuelBar = k.add([
    k.rect(FB_W, 12),
    k.color(63, 163, 77),
    k.pos(FB_X, 14),
    k.z(22),
  ]);

  k.onUpdate(() => {
    scoreLabel.text = `SCORE ${score}`;
    livesLabel.text = `LIVES ${lives}`;
    const pct = Math.round(((totalToMow - toMow) / totalToMow) * 100);
    mownLabel.text = `MOWN ${pct}%`;
    fuelBar.width = (fuel / FUEL_MAX) * FB_W;
    fuelBar.color =
      fuel < 25 ? k.rgb(230, 57, 70) : k.rgb(63, 163, 77);
  });
});

// ============================================================================
// WIN / LOSE
// ============================================================================

function endScene(name: string, title: string, color: [number, number, number]) {
  k.scene(name, (data: { score: number; reason?: string }) => {
    k.add([k.rect(GAME_W, GAME_H), k.color(13, 27, 42), k.pos(0, 0)]);
    k.add([
      k.text(title, { size: 36 }),
      k.anchor("center"),
      k.pos(GAME_W / 2, GAME_H / 2 - 60),
      k.color(...color),
    ]);
    if (data.reason) {
      k.add([
        k.text(data.reason, { size: 16 }),
        k.anchor("center"),
        k.pos(GAME_W / 2, GAME_H / 2 - 15),
        k.color(141, 153, 174),
      ]);
    }
    k.add([
      k.text(`Score: ${data.score}`, { size: 20 }),
      k.anchor("center"),
      k.pos(GAME_W / 2, GAME_H / 2 + 25),
      k.color(255, 210, 63),
    ]);
    k.add([
      k.text("press SPACE to play again", { size: 14 }),
      k.anchor("center"),
      k.pos(GAME_W / 2, GAME_H / 2 + 75),
      k.color(244, 244, 244),
    ]);
    k.onKeyPress("space", () => k.go("game"));
    k.onClick(() => k.go("game"));
  });
}

endScene("win", "LAWN PERFECT!", [63, 163, 77]);
endScene("lose", "GAME OVER", [230, 57, 70]);

k.go("menu");

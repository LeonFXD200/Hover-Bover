// Procedural pixel art — now with animation.
//
// A sprite is one or more "frames". Each frame is a grid of characters; every
// character maps to a colour in the palette ("." = transparent). Multi-frame
// sprites are rendered side-by-side into one horizontal sheet so Kaplay can
// slice and animate them (sliceX = frame count).
//
// All art lives here as plain text — tweak a grid, see the change. Swap for
// real .png sheets later without touching game code.

export type Palette = Record<string, string>;
export type Anim = { from: number; to: number; loop: boolean; speed: number };

export type SpriteDef = {
  name: string;
  data: string; // data URL
  sliceX: number; // number of frames across
  anims?: Record<string, Anim>;
};

function drawFrame(
  ctx: CanvasRenderingContext2D,
  grid: string[],
  palette: Palette,
  offsetX: number,
) {
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      const color = palette[ch];
      if (!color || ch === ".") continue;
      ctx.fillStyle = color;
      ctx.fillRect(offsetX + x, y, 1, 1);
    }
  }
}

// One frame.
function makeSprite(grid: string[], palette: Palette): { data: string } {
  return { data: makeSheet([grid], palette).data };
}

// Many frames laid out horizontally into a single sheet.
function makeSheet(
  frames: string[][],
  palette: Palette,
): { data: string; frameCount: number } {
  const fh = frames[0].length;
  const fw = Math.max(...frames.flatMap((f) => f.map((r) => r.length)));
  const canvas = document.createElement("canvas");
  canvas.width = fw * frames.length;
  canvas.height = fh;
  const ctx = canvas.getContext("2d")!;
  frames.forEach((f, i) => drawFrame(ctx, f, palette, i * fw));
  return { data: canvas.toDataURL(), frameCount: frames.length };
}

// --- Palette ----------------------------------------------------------------

const PAL: Palette = {
  ".": "transparent",
  k: "#1b1b29", // outline / dark
  w: "#f4f4f4", // white
  y: "#ffd23f", // yellow
  o: "#ff8c42", // orange
  r: "#e63946", // red
  g: "#3fa34d", // grass green
  G: "#2a7d3f", // dark green
  b: "#3a86ff", // blue
  B: "#1b4f9c", // dark blue
  s: "#8d99ae", // steel grey
  S: "#5c6675", // dark steel
  n: "#8a5a2b", // brown (dog / trunk)
  N: "#6b4420", // dark brown
  c: "#48cae4", // cyan (exhaust / vent)
  h: "#f1c27d", // skin
  H: "#5a3a1a", // hair
};

// === Player (blue critter on a steel hover-mower) — 2-frame hover bob ========

const PLAYER_A = [
  "................",
  ".....kkkk.......",
  "....kbbbbk......",
  "...kbwbwbbk.....",
  "...kbbbbbbk.....",
  "...kbBBBBbk.....",
  "....kbbbbk......",
  "...kkBBBBkk.....",
  "..ksSSSSSSsk....",
  ".ksSSSSSSSSsk...",
  ".ksScccccSSsk...",
  ".kSSSSSSSSSSk...",
  "..kkSkkkkSkk....",
  "...kk....kk.....",
  "................",
  "................",
];
// Frame B: exhaust puffs flicker beneath the wheels.
const PLAYER_B = [
  "................",
  ".....kkkk.......",
  "....kbbbbk......",
  "...kbwbwbbk.....",
  "...kbbbbbbk.....",
  "...kbBBBBbk.....",
  "....kbbbbk......",
  "...kkBBBBkk.....",
  "..ksSSSSSSsk....",
  ".ksSSSSSSSSsk...",
  ".ksScwcwcSSsk...",
  ".kSSSSSSSSSSk...",
  "..kkSkkkkSkk....",
  "...kk....kk.....",
  "...cc....cc.....",
  "................",
];

// === Dog — 2-frame run cycle (legs alternate) ===============================

const DOG_BODY = [
  "................",
  "................",
  "...kk......kk...",
  "..kNnk....kNnk..",
  "..knnkkkkkknnk..",
  "..knnnnnnnnnnk..",
  ".knnwknnnnknnk..",
  ".knnnnnnkknnnk..",
  ".knnnnnnnnnrnk..",
  "..knnnnnnnnnnk..",
];
const DOG_A = [
  ...DOG_BODY,
  "..kNnk....kNnk..",
  "..kNNk....kNNk..",
  "...kk......kk...",
  "................",
  "................",
  "................",
];
const DOG_B = [
  ...DOG_BODY,
  "..knnk....knnk..",
  "..kNk......kNk..",
  "..kk........kk..",
  "................",
  "................",
  "................",
];

// === Angry neighbour — 2-frame stomp (arms down / fists raised) =============

const NEIGHBOR_A = [
  "................",
  ".....HHHH.......",
  "....HHHHHH......",
  "....HhhhhH......",
  "....hkhhkh......",
  "....hhwwhh......",
  "....hhhhhh......",
  "....hhkkhh......",
  "...rrrrrrrr.....",
  "..hrrrrrrrrh....",
  "..hrrrrrrrrh....",
  "...rrrrrrrr.....",
  "...rr....rr.....",
  "...BB....BB.....",
  "...kk....kk.....",
  "................",
];
const NEIGHBOR_B = [
  "..h........h....",
  "..h..HHHH..h....",
  "....HHHHHH......",
  "....HhhhhH......",
  "....hkhhkh......",
  "....hhwwhh......",
  "....hhhhhh......",
  "....hhkkhh......",
  "...rrrrrrrr.....",
  "...rrrrrrrr.....",
  "...rrrrrrrr.....",
  "...rrrrrrrr.....",
  "...rr....rr.....",
  "...BB....BB.....",
  "...kk....kk.....",
  "................",
];

// === Static props ===========================================================

const FUEL = [
  "................",
  "................",
  ".....kkkk.......",
  "....kkyykk......",
  "...krrrrrrk.....",
  "...kryyyyrk.....",
  "...kryFFyrk.....",
  "...kryFFyrk.....",
  "...kryyyyrk.....",
  "...krrrrrrk.....",
  "...krrrrrrk.....",
  "...kkkkkkkk.....",
  "................",
  "................",
  "................",
  "................",
];
const TREE = [
  ".....gggg.......",
  "...ggGGGGgg.....",
  "..gGGggggGGg....",
  ".gGGgggggggGg...",
  ".gGgggGGgggGg...",
  "..gGGggggGGg....",
  "...ggGGGGgg.....",
  ".....gnng.......",
  "......nn........",
  "......nN........",
  "......nN........",
  ".....NnnN.......",
  "....NNnnNN......",
  "...NNNnnNNN.....",
  "................",
  "................",
];
const GRASS = Array.from({ length: 16 }, (_, r) =>
  (r % 2 ? "GgGgGgGgGgGgGgGg" : "gGgGgGgGgGgGgGgG"),
);
const MOWN = Array.from({ length: 16 }, (_, r) =>
  (r % 4 < 2 ? "tTtTtTtTtTtTtTtT" : "TtTtTtTtTtTtTtTt"),
);

const MOWN_PAL: Palette = { t: "#7ec46b", T: "#69b257" };
const FUEL_PAL: Palette = { ...PAL, F: "#1b1b29" };

// --- Export -----------------------------------------------------------------

export const SPRITES: SpriteDef[] = [
  {
    name: "player",
    ...makeSheet([PLAYER_A, PLAYER_B], PAL),
    sliceX: 2,
    anims: { hover: { from: 0, to: 1, loop: true, speed: 8 } },
  },
  {
    name: "dog",
    ...makeSheet([DOG_A, DOG_B], PAL),
    sliceX: 2,
    anims: { run: { from: 0, to: 1, loop: true, speed: 9 } },
  },
  {
    name: "neighbor",
    ...makeSheet([NEIGHBOR_A, NEIGHBOR_B], PAL),
    sliceX: 2,
    anims: { stomp: { from: 0, to: 1, loop: true, speed: 7 } },
  },
  { name: "fuel", ...makeSprite(FUEL, FUEL_PAL), sliceX: 1 },
  { name: "tree", ...makeSprite(TREE, PAL), sliceX: 1 },
  { name: "grass", ...makeSprite(GRASS, PAL), sliceX: 1 },
  { name: "mown", ...makeSprite(MOWN, MOWN_PAL), sliceX: 1 },
];

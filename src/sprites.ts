// Procedural pixel art.
//
// Each sprite is a small grid of characters. Every character maps to a colour
// in `palette` ("." = transparent). We render the grid to an offscreen canvas
// (one char = one pixel) and return a data URL that Kaplay can load as a sprite.
//
// This keeps every sprite as plain, editable text — tweak a grid, see the
// change. Swap these out for real .png art later without touching game code.

export type Palette = Record<string, string>;

export function makeSprite(grid: string[], palette: Palette): string {
  const h = grid.length;
  const w = Math.max(...grid.map((row) => row.length));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  for (let y = 0; y < h; y++) {
    const row = grid[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      const color = palette[ch];
      if (!color || ch === ".") continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return canvas.toDataURL();
}

// --- Shared palette ---------------------------------------------------------

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
  n: "#8a5a2b", // brown (trunk)
  N: "#6b4420", // dark brown
  p: "#ff5d8f", // pink
  c: "#48cae4", // cyan
};

// --- Sprite definitions -----------------------------------------------------
// 16x16 unless noted. Designed to read at small size, scaled up crisply.

// The player: a little blue critter riding a steel hover-mower.
const PLAYER = [
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

// The rival neighbour's grumpy dog — chases the player.
const DOG = [
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
  "..kNnk....kNnk..",
  "..kNNk....kNNk..",
  "...kk......kk...",
  "................",
  "................",
  "................",
];

// A fuel can — pick up to refill the mower.
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

// A tree obstacle (immovable).
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

// Tall (unmown) grass tile.
const GRASS = [
  "gGgGgGgGgGgGgGgG",
  "GgGgGgGgGgGgGgGg",
  "gGgGgGgGgGgGgGgG",
  "GgGgGgGgGgGgGgGg",
  "gGgGgGgGgGgGgGgG",
  "GgGgGgGgGgGgGgGg",
  "gGgGgGgGgGgGgGgG",
  "GgGgGgGgGgGgGgGg",
  "gGgGgGgGgGgGgGgG",
  "GgGgGgGgGgGgGgGg",
  "gGgGgGgGgGgGgGgG",
  "GgGgGgGgGgGgGgGg",
  "gGgGgGgGgGgGgGgG",
  "GgGgGgGgGgGgGgGg",
  "gGgGgGgGgGgGgGgG",
  "GgGgGgGgGgGgGgGg",
];

// Mown (cut) grass tile — lighter, striped like a fresh-cut lawn.
const MOWN = [
  "tTtTtTtTtTtTtTtT",
  "tTtTtTtTtTtTtTtT",
  "TtTtTtTtTtTtTtTt",
  "TtTtTtTtTtTtTtTt",
  "tTtTtTtTtTtTtTtT",
  "tTtTtTtTtTtTtTtT",
  "TtTtTtTtTtTtTtTt",
  "TtTtTtTtTtTtTtTt",
  "tTtTtTtTtTtTtTtT",
  "tTtTtTtTtTtTtTtT",
  "TtTtTtTtTtTtTtTt",
  "TtTtTtTtTtTtTtTt",
  "tTtTtTtTtTtTtTtT",
  "tTtTtTtTtTtTtTtT",
  "TtTtTtTtTtTtTtTt",
  "TtTtTtTtTtTtTtTt",
];

const MOWN_PAL: Palette = { t: "#7ec46b", T: "#69b257" };
const FUEL_PAL: Palette = { ...PAL, F: "#1b1b29" };

export const SPRITES: { name: string; data: string }[] = [
  { name: "player", data: makeSprite(PLAYER, PAL) },
  { name: "dog", data: makeSprite(DOG, PAL) },
  { name: "fuel", data: makeSprite(FUEL, FUEL_PAL) },
  { name: "tree", data: makeSprite(TREE, PAL) },
  { name: "grass", data: makeSprite(GRASS, PAL) },
  { name: "mown", data: makeSprite(MOWN, MOWN_PAL) },
];

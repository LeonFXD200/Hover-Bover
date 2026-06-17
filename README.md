# Hover Bover

A modern pixel-art reskin of the classic 1984 arcade game *Hover Bover*.
Mow every lawn before the neighbour's dog catches you — or you run out of fuel.

Built with **TypeScript + [Kaplay](https://kaplayjs.com/) + [Vite](https://vitejs.dev/)**.
Runs in any browser; deploys as a static site.

## Controls

- **Arrow keys / WASD** — drive the mower
- **Space** — start / restart
- Drive over tall grass to mow it. Grab **fuel cans** before the bar empties.
  Avoid the **dog** and the **trees**.

## Develop

```bash
npm install
npm run dev      # starts a hot-reloading dev server (http://localhost:5173)
```

## Build

```bash
npm run build    # type-checks, then bundles to ./docs
npm run preview  # serve the production build locally to check it
```

The build output in `docs/` is plain static files (HTML + JS + assets) — host
it anywhere.

## Deploy

Any static host works. Easiest options (all free):

- **Cloudflare Pages / Netlify / Vercel** — connect this git repo, set
  build command `npm run build` and output directory `docs`. Auto-deploys on push.
- **GitHub Pages** — in Settings -> Pages, choose **Deploy from a branch**,
  branch `master`, folder `/docs`.
  (`base: "./"` in `vite.config.ts` already makes the build work from a subpath.)

## Project layout

| File | What it is |
| --- | --- |
| `src/main.ts` | Game logic: scenes, movement, mowing, dog AI, fuel, HUD |
| `src/sprites.ts` | Pixel art — each sprite is a text grid + colour palette |
| `src/sound.ts` | Chiptune-style sound effects via the Web Audio API |
| `index.html` | Page shell + canvas scaling |

### Tweaking the game

- **Difficulty / balance:** the tuning constants at the top of `src/main.ts`
  (`PLAYER_SPEED`, `DOG_SPEED`, `FUEL_BURN`, `START_LIVES`, etc.).
- **Art:** edit the character grids in `src/sprites.ts`. Each letter maps to a
  colour in the palette; `.` is transparent. No image files needed (swap in
  real `.png`s later if you want).
- **Sound:** the blip frequencies in `src/sound.ts`.

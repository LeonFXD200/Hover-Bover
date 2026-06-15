import { defineConfig } from "vite";

export default defineConfig({
  // Relative base so the built game works on any static host
  // (GitHub Pages subpaths, Netlify, Cloudflare Pages, etc.).
  base: "./",
  server: {
    // Honour the PORT env var (the preview harness assigns a free port here);
    // fall back to 5173 for plain `npm run dev`.
    port: Number(process.env.PORT) || 5173,
  },
});

import { defineConfig } from "vite";

export default defineConfig({
  server: {
    // En `npm run dev`, las llamadas a /api van al Worker local (`npm run dev` en la raiz).
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
});

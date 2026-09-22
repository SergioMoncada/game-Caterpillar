import { defineConfig } from "vite";

// API_TARGET: a dónde redirige /api en `npm run dev`.
//   Django (por defecto): http://127.0.0.1:8000
//   Worker local (wrangler dev): http://127.0.0.1:8787
const API_TARGET = process.env.API_TARGET ?? "http://127.0.0.1:8000";

export default defineConfig({
  server: {
    host: true, // accesible desde el celular en la misma red Wi-Fi
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: true },
    },
  },
});

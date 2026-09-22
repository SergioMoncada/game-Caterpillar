import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: true, // accesible desde el celular en la misma red Wi-Fi
    // En `npm run dev`, las llamadas a /api van al Worker local (`npm run dev` en la raiz).
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
});

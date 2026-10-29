import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  server: {
    host: "0.0.0.0",
    port: 5173,
    fs: { allow: [".."] },
    proxy: {
      "/v1": "http://127.0.0.1:8787",
      "/health": "http://127.0.0.1:8787",
      "/docs": "http://127.0.0.1:8787",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});

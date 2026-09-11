import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.OCELOT_WEB_PORT ?? 5173),
    strictPort: true,
    proxy: { "/api": `http://127.0.0.1:${process.env.OCELOT_WORKER_PORT ?? 8787}` },
  },
  build: { target: "es2022" },
});

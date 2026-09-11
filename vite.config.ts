import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: Number(process.env.OCELOT_WEB_PORT ?? 7049),
    strictPort: true,
    allowedHosts: ["ocelot.dev.hexly.ai"],
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.OCELOT_WORKER_PORT ?? 37049}`,
        changeOrigin: true,
      },
    },
  },
  build: { target: "es2022" },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: process.env.API_TARGET ?? "http://localhost:8080",
        changeOrigin: true,
        configure: (proxy) => {
          // Бекенд разрешает CORS только для :5173/:8081 — мы на :8082.
          // Убираем Origin и Referer, чтобы запрос воспринимался как same-origin.
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.removeHeader("origin");
            proxyReq.removeHeader("referer");
          });
        },
      },
    },
  },
});

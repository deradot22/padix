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
    port: 5173,
    // Для dev-тестов OAuth-провайдеров (Telegram Login Widget не принимает localhost
    // как домен бота) — разрешаем альтернативы:
    //   - padix.club — если прописали в hosts на 127.0.0.1, то же доменное имя что в проде
    //   - lvh.me/nip.io — публично резолвятся в 127.0.0.1, не требуют hosts
    //   - ngrok — туннели наружу
    allowedHosts: ["localhost", "padix.club", "www.padix.club", ".lvh.me", "lvh.me", ".nip.io", ".ngrok-free.app", ".ngrok.io"],
    proxy: {
      '/api': {
        target: process.env.API_TARGET ?? 'http://localhost:8080',
        changeOrigin: true,
        configure: (proxy) => {
          // Бекенд CORS принимает только :5173/:8081/prod-домены.
          // В dev используем proxy и убираем Origin/Referer, чтобы
          // запрос воспринимался как same-origin (не зависит от того,
          // на каком порту запустили web — 8081, 8083, etc.).
          // В проде этот код не используется (там Cloudflare Pages статика).
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('referer');
          });
        },
      },
    },
  },
});


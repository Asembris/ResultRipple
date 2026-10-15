import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// The API is proxied under /api so the HttpOnly demo session cookie stays
// first-party in development, exactly as it will be behind one origin in
// deployment.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8000",
        changeOrigin: false,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.tsx", "tests/**/*.test.ts"],
  },
});

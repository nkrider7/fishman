import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@tauri-icons": path.resolve(__dirname, "./src-tauri/icons"),
      buffer: "buffer/",
    },
  },
  optimizeDeps: {
    include: ["buffer", "isomorphic-git", "isomorphic-git/http/web"],
  },
  define: {
    global: "globalThis",
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
    fs: {
      allow: [path.resolve(__dirname, "."), path.resolve(__dirname, "src-tauri")],
    },
  },
}));

import { defineConfig } from "vite";

// "./" keeps every asset path relative, so dist/ works under any subpath
// (e.g. https://<user>.github.io/upbit-notice-market/).
export default defineConfig({
  base: "./",
  build: { target: "es2020", chunkSizeWarningLimit: 1500 },
});

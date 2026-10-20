import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Die jSquash-Pakete laden ihre .wasm-Dateien über import.meta.url.
// Damit Vite diese Pfade nicht beim Pre-Bundling zerstört, werden sie ausgeschlossen.
const jsquash = [
  "@jsquash/jpeg",
  "@jsquash/png",
  "@jsquash/webp",
  "@jsquash/avif",
  "@jsquash/resize",
  "@jsquash/oxipng",
];

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  optimizeDeps: { exclude: jsquash },
  worker: { format: "es" },
  build: { target: "safari16", chunkSizeWarningLimit: 2000 },
});

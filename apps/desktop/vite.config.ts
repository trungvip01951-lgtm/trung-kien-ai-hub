import { defineConfig } from "vite";

// Giao diện React build ra dist/renderer, nạp bằng file:// trong Electron nên dùng đường dẫn tương đối.
export default defineConfig({
  root: "src/renderer",
  base: "./",
  build: { outDir: "../../dist/renderer", emptyOutDir: true },
});

import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  plugins: [solid()],
  server: { port: 5174, strictPort: true },
  build: { target: "es2022" },
});

import { build } from "esbuild";

await build({
  entryPoints: ["src/cli.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: "dist/cli.mjs",
});

await build({
  entryPoints: ["src/host.ts"],
  bundle: true,
  format: "iife",
  globalName: "VpkHost",
  target: "es2022",
  outfile: "dist/host.js",
});

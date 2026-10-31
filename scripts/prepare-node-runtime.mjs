import { chmodSync, copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeDir = join(root, "apps/desktop/src-tauri/runtime");
const name = process.platform === "win32" ? "node.exe" : "node";
const target = join(runtimeDir, name);
const source = process.execPath;

mkdirSync(runtimeDir, { recursive: true });

const sameBinary =
  existsSync(target) && statSync(target).size === statSync(source).size;

if (sameBinary) {
  console.log(`[vela] Node runtime already staged: ${target}`);
} else {
  copyFileSync(source, target);
  chmodSync(target, 0o755);
  console.log(`[vela] staged Node runtime: ${target}`);
}

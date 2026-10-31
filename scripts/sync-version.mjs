import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const desktopPackagePath = path.join(root, "apps/desktop/package.json");
const desktopPackage = JSON.parse(readFileSync(desktopPackagePath, "utf8"));
const version = desktopPackage.version;

function replaceFirst(file, pattern, replacement) {
  const absolute = path.join(root, file);
  const source = readFileSync(absolute, "utf8");
  if (!pattern.test(source)) {
    throw new Error(`Version pattern not found in ${file}`);
  }
  const updated = source.replace(pattern, replacement);
  if (updated !== source) {
    writeFileSync(absolute, updated);
    console.log(`[version] ${file} -> ${version}`);
  }
}

replaceFirst(
  "apps/desktop/src-tauri/tauri.conf.json",
  /("version":\s*")[^"]+(")/,
  `$1${version}$2`,
);

replaceFirst(
  "apps/desktop/src-tauri/Cargo.toml",
  /(\[package\][\s\S]*?\nversion = ")[^"]+(")/,
  `$1${version}$2`,
);

replaceFirst(
  "apps/desktop/src-tauri/Cargo.lock",
  /(\[\[package\]\]\nname = "vela-desktop"\nversion = ")[^"]+(")/,
  `$1${version}$2`,
);

console.log(`[version] desktop version ${version}`);

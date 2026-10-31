import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const desktopPackage = JSON.parse(
  readFileSync(path.join(root, "apps/desktop/package.json"), "utf8"),
);
const tag = `v${desktopPackage.version}`;

const existing = spawnSync("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}`], {
  cwd: root,
  stdio: "ignore",
});
if (existing.status === 0) {
  console.error(`[release] ${tag} already exists`);
  process.exit(1);
}

execFileSync("git", ["tag", "-a", tag, "-m", `Vela ${tag}`], {
  cwd: root,
  stdio: "inherit",
});
console.log(`[release] created ${tag}`);
console.log(`[release] push with: git push origin main ${tag}`);

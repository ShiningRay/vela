import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { formatLintResult, lintVpk } from "./lint";
import { createRunServer } from "./serve";

const USAGE = `Usage:
  vpk lint <file.vpk>                 Validate a .vpk without running it (exit 1 on failure)
  vpk run  <file.vpk> [options]       Serve a debug host page for the package
    --port <n>    port for the run server (default 4390)
    --debug       forward package console output to the host page console
    --no-open     do not open the browser automatically`;

function findHostJs(): string | undefined {
  const candidates = [
    new URL("./host.js", import.meta.url),
    new URL("../dist/host.js", import.meta.url),
  ];
  for (const candidate of candidates) {
    const path = fileURLToPath(candidate);
    if (existsSync(path)) return path;
  }
  return undefined;
}

function openBrowser(url: string): void {
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    const child = spawn(opener, [url], { detached: true, stdio: "ignore" });
    child.on("error", () => {});
    child.unref();
  } catch {
    // Best effort; the URL is printed either way.
  }
}

async function readFileBuffer(path: string): Promise<ArrayBuffer> {
  const buffer = await readFile(path);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

async function main(argv: string[]): Promise<number> {
  const [command, file, ...rest] = argv;
  if (!command || !file || command === "--help" || command === "-h" || !["lint", "run"].includes(command)) {
    console.log(USAGE);
    return command === "--help" || command === "-h" ? 0 : 1;
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await readFileBuffer(file);
  } catch (error) {
    console.error(`Cannot read ${file}: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  if (command === "lint") {
    const result = lintVpk(bytes);
    console.log(formatLintResult(result));
    return result.ok ? 0 : 1;
  }

  let port: number | undefined;
  let debugConsole = false;
  let open = true;
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    if (flag === "--port") {
      const value = Number(rest[++index]);
      if (!Number.isInteger(value) || value <= 0 || value > 65535) {
        console.error("--port expects a port number");
        return 1;
      }
      port = value;
    } else if (flag === "--debug") {
      debugConsole = true;
    } else if (flag === "--no-open") {
      open = false;
    } else {
      console.error(`Unknown option: ${flag}`);
      console.log(USAGE);
      return 1;
    }
  }

  const hostJs = findHostJs();
  if (!hostJs) {
    console.error("dist/host.js not found — run `pnpm --filter @vela/vpk build` first");
    return 1;
  }

  const handle = await createRunServer(file, { port, debugConsole, hostJsPath: hostJs });
  console.log(`vpk run: ${file}`);
  console.log(`debug host: ${handle.url} (Ctrl-C to stop)`);
  if (open) openBrowser(handle.url);
  return 0;
}

const exitCode = await main(process.argv.slice(2));
if (exitCode !== 0) process.exitCode = exitCode;

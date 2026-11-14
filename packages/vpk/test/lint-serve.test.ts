import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterEach, describe, expect, it } from "vitest";
import { formatLintResult, lintVpk } from "../src/lint";
import { createRunServer } from "../src/serve";

function archive(files: Record<string, string>): ArrayBuffer {
  const zipped = zipSync(
    Object.fromEntries(Object.entries(files).map(([path, content]) => [path, strToU8(content)])),
  );
  return zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer;
}

const manifest = {
  id: "hello-package",
  name: "Hello Package",
  version: "1.0.0",
  entry: "index.html",
};

describe("lintVpk", () => {
  it("reports a valid package with manifest, agent and file details", () => {
    const result = lintVpk(
      archive({
        "manifest.json": JSON.stringify({
          ...manifest,
          permissions: ["surface:create"],
          agent: { tools: [{ name: "seed_rows", type: "static", path: "data/seed.json" }] },
        }),
        "index.html": "<h1>Hello</h1>",
        "data/seed.json": "[1,2,3]",
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.manifest?.id).toBe("hello-package");
    expect(result.manifest?.permissions).toEqual(["surface:create"]);
    expect(result.manifest?.agent).toEqual({ surfaces: 0, charts: 0, datasources: 0, tools: 1 });
    expect(result.files?.map((file) => file.path)).toEqual(["data/seed.json", "index.html", "manifest.json"]);
    expect(result.totalBytes).toBeGreaterThan(0);

    const report = formatLintResult(result);
    expect(report).toContain("✔ manifest ok: hello-package v1.0.0");
    expect(report).toContain("data/seed.json");
  });

  it("reports the parse error for an invalid package", () => {
    const result = lintVpk(archive({ "index.html": "<h1>no manifest</h1>" }));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/manifest.json/);
    expect(formatLintResult(result)).toMatch(/✘/);
  });
});

describe("createRunServer", () => {
  const handles: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    for (const handle of handles.splice(0)) await handle.close();
  });

  it("serves the host page, host bundle and fresh package bytes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vpk-run-"));
    const vpkPath = join(dir, "hello.vpk");
    const hostJsPath = join(dir, "host.js");
    const zip = Buffer.from(archive({ "manifest.json": JSON.stringify(manifest), "index.html": "<h1>Hello</h1>" }));
    await writeFile(vpkPath, zip);
    await writeFile(hostJsPath, "// host stub");

    const handle = await createRunServer(vpkPath, { port: 0, hostJsPath });
    handles.push(handle);

    const page = await fetch(new URL("/", handle.url));
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    const html = await page.text();
    expect(html).toContain("mountVpkHost");
    expect(html).toContain("debugConsole: false");

    const host = await fetch(new URL("/host.js", handle.url));
    expect(await host.text()).toBe("// host stub");

    const bytes = await fetch(new URL("/package.vpk", handle.url));
    expect(bytes.status).toBe(200);
    expect(Buffer.from(await bytes.arrayBuffer()).equals(zip)).toBe(true);

    const missing = await fetch(new URL("/nope", handle.url));
    expect(missing.status).toBe(404);
  });

  it("re-reads the package from disk on every request", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vpk-run-"));
    const vpkPath = join(dir, "hello.vpk");
    await writeFile(vpkPath, Buffer.from(archive({ "manifest.json": JSON.stringify(manifest), "index.html": "<h1>v1</h1>" })));

    const handle = await createRunServer(vpkPath, { port: 0, hostJsPath: join(dir, "host.js") });
    handles.push(handle);

    const before = await fetch(new URL("/package.vpk", handle.url));
    await writeFile(
      vpkPath,
      Buffer.from(archive({ "manifest.json": JSON.stringify(manifest), "index.html": "<h1>v2 with a longer body</h1>" })),
    );
    const after = await fetch(new URL("/package.vpk", handle.url));
    expect(before.status).toBe(200);
    expect(after.status).toBe(200);
    expect(Buffer.from(await after.arrayBuffer()).byteLength).not.toBe(
      Buffer.from(await before.arrayBuffer()).byteLength,
    );
  });
});

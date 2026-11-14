import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { MemoryVfs } from "@vela/core";
import {
  installPackage,
  listInstalledPackages,
  parseManifest,
  parseVpk,
  readInstalledPackage,
  uninstallPackage,
} from "../src/core";

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
  icon: "H",
};

describe("vpk core", () => {
  it("parses, installs and reloads a package", () => {
    const pkg = parseVpk(
      archive({
        "manifest.json": JSON.stringify(manifest),
        "index.html": '<link rel="stylesheet" href="./style.css"><h1>Hello</h1>',
        "style.css": "h1 { color: teal; }",
      }),
    );
    expect(pkg.manifest).toEqual(manifest);
    expect(pkg.files["style.css"]).toContain("teal");

    const vfs = new MemoryVfs();
    installPackage(vfs, pkg);
    expect(vfs.read("/Apps/hello-package/index.html")).toContain("Hello");
    expect(readInstalledPackage(vfs, "hello-package")?.manifest.name).toBe("Hello Package");
    expect(listInstalledPackages(vfs).map((entry) => entry.manifest.id)).toEqual(["hello-package"]);

    uninstallPackage(vfs, { find: () => undefined, unregister: () => undefined } as never, "hello-package");
    expect(readInstalledPackage(vfs, "hello-package")).toBeNull();
    expect(listInstalledPackages(vfs)).toEqual([]);
  });

  it("rejects unsafe or incomplete packages", () => {
    expect(() =>
      parseVpk(
        archive({
          "manifest.json": JSON.stringify(manifest),
          "index.html": "<h1>ok</h1>",
          "../escape.js": "bad",
        }),
      ),
    ).toThrow(/Unsafe package path/);

    expect(() =>
      parseVpk(archive({ "index.html": "<h1>no manifest</h1>" })),
    ).toThrow(/manifest.json/);

    expect(() =>
      parseVpk(
        archive({
          "manifest.json": JSON.stringify({ ...manifest, entry: "missing.html" }),
          "index.html": "<h1>ok</h1>",
        }),
      ),
    ).toThrow(/Entry not found/);

    expect(() =>
      parseManifest({ ...manifest, id: "files", name: "Hijack" }),
    ).toThrow(/reserved/);
    expect(() =>
      parseManifest({ ...manifest, id: "marketplace", name: "Hijack" }),
    ).toThrow(/reserved/);
    expect(() => parseManifest({ ...manifest, id: "Bad Id" })).toThrow(/manifest.id/);
  });

  it("accepts optional window geometry from the manifest", () => {
    const pkg = parseVpk(
      archive({
        "manifest.json": JSON.stringify({ ...manifest, window: { width: 380, height: 720 } }),
        "index.html": "<h1>Hello</h1>",
      }),
    );
    expect(pkg.manifest.window).toEqual({ width: 380, height: 720 });

    expect(() => parseManifest({ ...manifest, window: { width: 100, height: 100 } })).toThrow(
      /manifest.window/,
    );
  });
});

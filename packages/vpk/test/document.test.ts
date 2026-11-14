import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { packageDocument } from "../src/document";
import { parseVpk } from "../src/core";
import { BRIDGE_SOURCE } from "../src/bridge";

function archive(files: Record<string, string>): ArrayBuffer {
  const zipped = zipSync(
    Object.fromEntries(Object.entries(files).map(([path, content]) => [path, strToU8(content)])),
  );
  return zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer;
}

function helloPackage(): ReturnType<typeof parseVpk> {
  return parseVpk(
    archive({
      "manifest.json": JSON.stringify({
        id: "hello-package",
        name: "Hello Package",
        version: "1.0.0",
        entry: "index.html",
      }),
      "index.html":
        '<link rel="stylesheet" href="./style.css"><h1 id="title">Hello</h1><script src="./app.js" type="module"></script>',
      "style.css": "#title { color: teal; }",
      "app.js": "console.log('ready');",
      "logo.svg": "<svg></svg>",
    }),
  );
}

describe("packageDocument", () => {
  it("inlines css/js, blob-urls other assets and injects the sandbox CSP", () => {
    const doc = packageDocument(helloPackage());
    try {
      expect(doc.html).toContain('Content-Security-Policy');
      expect(doc.html).toContain("default-src 'none'");
      expect(doc.html).toContain("<style>#title { color: teal; }</style>");
      expect(doc.html).toContain("<script type=\"module\">console.log('ready');</script>");
      expect(doc.html).toMatch(/logo\.svg|blob:/);
      expect(doc.html).not.toContain("<link");
    } finally {
      doc.revoke();
    }
  });

  it("does not inject the bridge by default", () => {
    const doc = packageDocument(helloPackage());
    try {
      expect(doc.html).not.toContain(BRIDGE_SOURCE);
      expect(doc.html).not.toContain("postMessage");
    } finally {
      doc.revoke();
    }
  });

  it("injects the console bridge only in debug mode", () => {
    const doc = packageDocument(helloPackage(), { debugConsole: true });
    try {
      expect(doc.html).toContain(BRIDGE_SOURCE);
      expect(doc.html.indexOf("Content-Security-Policy")).toBeLessThan(doc.html.indexOf(BRIDGE_SOURCE));
    } finally {
      doc.revoke();
    }
  });
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { MarketplaceStore } from "../src/store";

function packageBuffer(overrides: Record<string, unknown> = {}): Buffer {
  const manifest = {
    id: "market-demo",
    name: "Market Demo",
    version: "1.0.0",
    entry: "index.html",
    icon: "M",
    ...overrides,
  };
  const archive = zipSync({
    "manifest.json": strToU8(JSON.stringify(manifest)),
    "index.html": strToU8("<!doctype html><h1>Market demo</h1>"),
  });
  return Buffer.from(archive);
}

describe("marketplace API", () => {
  let dataDir: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "vela-marketplace-"));
    app = createApp({
      store: new MarketplaceStore(dataDir),
      adminToken: "test-token",
    });
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("uploads, searches and downloads a VPK", async () => {
    const buffer = packageBuffer();
    await request(app)
      .post("/api/plugins")
      .set("Authorization", "Bearer test-token")
      .field("description", "A demo plugin")
      .field("author", "E2E")
      .field("tags", "demo,test")
      .attach("file", buffer, "market-demo.vpk")
      .expect(201)
      .expect((response) => {
        expect(response.body.id).toBe("market-demo");
        expect(response.body.latestVersion).toBe("1.0.0");
      });

    const list = await request(app).get("/api/plugins?q=demo").expect(200);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0]).toMatchObject({
      id: "market-demo",
      name: "Market Demo",
      author: "E2E",
      latestVersion: "1.0.0",
      tags: ["demo", "test"],
    });

    const download = await request(app)
      .get("/api/plugins/market-demo/download?version=latest")
      .expect(200)
      .expect("Content-Type", "application/zip");
    expect(download.headers["content-disposition"]).toContain("market-demo-1.0.0.vpk");
    expect(download.headers["content-length"]).toBe(String(buffer.length));
    expect(download.headers["x-vpk-sha256"]).toMatch(/^[a-f0-9]{64}$/);

    const after = await request(app).get("/api/plugins/market-demo").expect(200);
    expect(after.body.downloads).toBe(1);
  });

  it("rejects missing tokens, duplicate versions and malformed packages", async () => {
    const buffer = packageBuffer();
    await request(app).post("/api/plugins").attach("file", buffer, "demo.vpk").expect(401);
    await request(app)
      .post("/api/plugins")
      .set("Authorization", "Bearer wrong")
      .attach("file", buffer, "demo.vpk")
      .expect(401);
    await request(app)
      .post("/api/plugins")
      .set("Authorization", "Bearer test-token")
      .attach("file", buffer, "demo.vpk")
      .expect(201);
    await request(app)
      .post("/api/plugins")
      .set("Authorization", "Bearer test-token")
      .attach("file", buffer, "demo.vpk")
      .expect(409);

    await request(app)
      .post("/api/plugins")
      .set("Authorization", "Bearer test-token")
      .attach("file", Buffer.from("not a zip"), "bad.vpk")
      .expect(400);

    await request(app)
      .post("/api/plugins")
      .set("Authorization", "Bearer test-token")
      .attach("file", packageBuffer({ entry: "missing.html" }), "missing.vpk")
      .expect(400);
  });
});

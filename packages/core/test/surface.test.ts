import { describe, expect, it, vi } from "vitest";
import { SurfaceError, SurfaceRegistry } from "../src/surface";
import type { SurfaceRecord } from "../src/surface";

function widgetInput(overrides: Partial<Parameters<SurfaceRegistry["create"]>[0]> = {}) {
  return {
    id: "w1",
    owner: "agent-a",
    kind: "widget" as const,
    title: "Revenue",
    geometry: { x: 10, y: 20, width: 320, height: 200 },
    content: { type: "static" as const, title: "Revenue", body: "1.2M" },
    ...overrides,
  };
}

describe("SurfaceRegistry", () => {
  it("creates a surface and returns its record", () => {
    const registry = new SurfaceRegistry();
    const record = registry.create(widgetInput());
    expect(record).toMatchObject({ id: "w1", owner: "agent-a", kind: "widget", persist: false });
    expect(registry.get("w1")).toBeDefined();
  });

  it("rejects a duplicate id without touching the existing surface", () => {
    const registry = new SurfaceRegistry();
    registry.create(widgetInput());
    expect(() => registry.create(widgetInput({ title: "Other" }))).toThrowError(SurfaceError);
    try {
      registry.create(widgetInput());
    } catch (error) {
      expect((error as SurfaceError).code).toBe("duplicate_id");
    }
    expect(registry.get("w1")!.title).toBe("Revenue");
  });

  it("rejects html, url and script content types", () => {
    const registry = new SurfaceRegistry();
    for (const type of ["html", "url", "script", "iframe"]) {
      expect(() => registry.create(widgetInput({ content: { type } as never }))).toThrowError(SurfaceError);
      try {
        registry.create(widgetInput({ content: { type } as never }));
      } catch (error) {
        expect((error as SurfaceError).code).toBe("unsupported_content");
        expect((error as SurfaceError).available).toEqual(["static", "remote", "component", "chart"]);
      }
    }
    expect(registry.items).toHaveLength(0);
  });

  it("accepts the four whitelisted content types", () => {
    const registry = new SurfaceRegistry();
    registry.create(widgetInput({ id: "s", content: { type: "static", title: "t", body: "b" } }));
    registry.create(widgetInput({ id: "r", content: { type: "remote", sourceKey: "agent.a.data.x" } }));
    registry.create(widgetInput({ id: "c", content: { type: "component", appId: "sales-board" } }));
    registry.create(
      widgetInput({
        id: "ch",
        content: { type: "chart", spec: { kind: "line", encoding: { x: "date", y: "revenue" } }, dataKey: "daily" },
      }),
    );
    expect(registry.items).toHaveLength(4);
  });

  it("rejects chart content whose spec fails structural validation", () => {
    const registry = new SurfaceRegistry();
    expect(() =>
      registry.create(
        widgetInput({ content: { type: "chart", spec: { kind: "gauge", encoding: { value: "v" } } } }),
      ),
    ).toThrowError(SurfaceError);
    try {
      registry.create(
        widgetInput({ content: { type: "chart", spec: { kind: "gauge", encoding: { value: "v" } } } }),
      );
    } catch (error) {
      expect((error as SurfaceError).code).toBe("invalid_spec");
      expect((error as SurfaceError).path).toBe("encoding.max");
    }
  });

  it("isolates owners: cross-owner patch, remove and list are rejected", () => {
    const registry = new SurfaceRegistry();
    registry.create(widgetInput());
    expect(() => registry.patch("w1", "agent-b", { title: "Hijack" })).toThrowError(SurfaceError);
    try {
      registry.patch("w1", "agent-b", { title: "Hijack" });
    } catch (error) {
      expect((error as SurfaceError).code).toBe("forbidden");
    }
    expect(registry.get("w1")!.title).toBe("Revenue");

    expect(() => registry.remove("w1", "agent-b")).toThrowError(SurfaceError);
    expect(registry.has("w1")).toBe(true);

    registry.create(widgetInput({ id: "w2", owner: "agent-b" }));
    expect(registry.list("agent-a").map((record) => record.id)).toEqual(["w1"]);
    expect(registry.list("agent-b").map((record) => record.id)).toEqual(["w2"]);
  });

  it("patches geometry, content and ttl for the owning caller", () => {
    const registry = new SurfaceRegistry({ now: () => 1000 });
    registry.create(widgetInput({ ttlSeconds: 10 }));
    const patched = registry.patch("w1", "agent-a", {
      geometry: { x: 0, y: 0, width: 100, height: 80 },
      ttlSeconds: 5,
    });
    expect(patched.geometry).toEqual({ x: 0, y: 0, width: 100, height: 80 });
    expect(patched.expiresAt).toBe(6000);
  });

  it("rejects patches with invalid geometry or content", () => {
    const registry = new SurfaceRegistry();
    registry.create(widgetInput());
    expect(() => registry.patch("w1", "agent-a", { geometry: { x: 0, y: 0, width: -5, height: 10 } })).toThrowError(
      SurfaceError,
    );
    expect(() => registry.patch("w1", "agent-a", { content: { type: "url" } as never })).toThrowError(SurfaceError);
    expect(() => registry.patch("missing", "agent-a", { title: "x" })).toThrowError(SurfaceError);
  });

  it("removes surfaces and reports unknown ids", () => {
    const registry = new SurfaceRegistry();
    registry.create(widgetInput());
    expect(registry.remove("w1", "agent-a").id).toBe("w1");
    expect(registry.has("w1")).toBe(false);
    expect(() => registry.remove("w1", "agent-a")).toThrowError(SurfaceError);
    try {
      registry.remove("w1", "agent-a");
    } catch (error) {
      expect((error as SurfaceError).code).toBe("unknown_surface");
    }
  });

  it("sweeps expired ttl surfaces", () => {
    let now = 1000;
    const registry = new SurfaceRegistry({ now: () => now });
    registry.create(widgetInput({ ttlSeconds: 10 }));
    registry.create(widgetInput({ id: "w2", ttlSeconds: 60 }));
    now += 11_000;
    const removed = registry.sweepExpired();
    expect(removed.map((record) => record.id)).toEqual(["w1"]);
    expect(registry.has("w1")).toBe(false);
    expect(registry.has("w2")).toBe(true);
  });

  it("auto-sweeps on an interval for fake-timer tests", () => {
    vi.useFakeTimers();
    try {
      const registry = new SurfaceRegistry({ autoSweepMs: 1000 });
      registry.create(widgetInput({ ttlSeconds: 5 }));
      vi.advanceTimersByTime(6_000);
      expect(registry.has("w1")).toBe(false);
      registry.stopAutoSweep();
    } finally {
      vi.useRealTimers();
    }
  });

  it("notifies source subscribers on every mutation", () => {
    const registry = new SurfaceRegistry();
    const seen: number[] = [];
    const unsubscribe = registry.source.subscribe(() => seen.push(registry.source.get().length));
    registry.create(widgetInput());
    registry.remove("w1", "agent-a");
    expect(seen).toEqual([1, 0]);
    unsubscribe();
    registry.create(widgetInput({ id: "w3" }));
    expect(seen).toEqual([1, 0]);
  });

  describe("authority mirror and replay", () => {
    const record = (overrides: Partial<SurfaceRecord>): SurfaceRecord => ({
      id: "w1",
      owner: "agent-a",
      kind: "widget",
      title: "Revenue",
      geometry: { x: 0, y: 0, width: 100, height: 80 },
      content: { type: "static", title: "t", body: "b" },
      persist: false,
      createdAt: 1,
      ...overrides,
    });

    it("upserts authority records and removes stale ones, keeping replayed surfaces", () => {
      const registry = new SurfaceRegistry();
      registry.replay([record({ id: "kept", persist: true })]);
      registry.applyAuthority([record({ id: "w1" }), record({ id: "w2", owner: "agent-b" })]);
      expect(registry.list().map((entry) => entry.id).sort()).toEqual(["kept", "w1", "w2"]);

      registry.applyAuthority([record({ id: "w1" })]);
      expect(registry.list().map((entry) => entry.id).sort()).toEqual(["kept", "w1"]);

      registry.applyAuthority([record({ id: "kept" })]);
      expect(registry.list()).toHaveLength(1);
      expect(registry.get("kept")!.owner).toBe("agent-a");
    });

    it("validates content on trusted paths too", () => {
      const registry = new SurfaceRegistry();
      expect(() => registry.applyAuthority([record({ content: { type: "url" } as never })])).toThrowError(
        SurfaceError,
      );
      expect(registry.items).toHaveLength(0);
    });
  });
});

describe("WindowManager kind and decorations", () => {
  it("defaults new windows to decorated window kind", async () => {
    const { WindowManager } = await import("../src/window-manager");
    const windows = new WindowManager();
    const record = windows.open("w", { geometry: { x: 0, y: 0, width: 100, height: 80 } });
    expect(record.kind).toBe("window");
    expect(record.decorations).toBe(true);
  });

  it("opens undecorated widgets that keep geometry behaviour", async () => {
    const { WindowManager } = await import("../src/window-manager");
    const windows = new WindowManager();
    const record = windows.open("widget-1", {
      geometry: { x: 0, y: 0, width: 200, height: 120 },
      kind: "widget",
      decorations: false,
      minWidth: 120,
      minHeight: 80,
    });
    expect(record.kind).toBe("widget");
    expect(record.decorations).toBe(false);
    windows.move("widget-1", 50, 60);
    expect(windows.record("widget-1")!.geometry).toMatchObject({ x: 50, y: 60 });
    windows.resize("widget-1", 10, 10);
    expect(windows.record("widget-1")!.geometry).toMatchObject({ width: 120, height: 80 });
  });
});

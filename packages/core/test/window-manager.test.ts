import { describe, expect, it } from "vitest";
import { clampGeometry, halfGeometry, WindowManager } from "../src/window-manager";

describe("clampGeometry", () => {
  it("keeps windows inside the viewport and above the minimum size", () => {
    expect(clampGeometry({ x: -20, y: -20, width: 300, height: 200 }, { width: 1000, height: 800 }))
      .toEqual({ x: 0, y: 0, width: 300, height: 200 });

    expect(clampGeometry({ x: 2000, y: 2000, width: 300, height: 200 }, { width: 1000, height: 800 }))
      .toEqual({ x: 700, y: 600, width: 300, height: 200 });

    expect(clampGeometry({ x: 0, y: 0, width: 10, height: 10 }, { width: 1000, height: 800 }))
      .toEqual({ x: 0, y: 0, width: 160, height: 70 });
  });
});

describe("halfGeometry", () => {
  it("splits the viewport into left and right halves", () => {
    expect(halfGeometry("left", { width: 1000, height: 800 }))
      .toEqual({ x: 0, y: 0, width: 500, height: 800 });
    expect(halfGeometry("right", { width: 1000, height: 800 }))
      .toEqual({ x: 500, y: 0, width: 500, height: 800 });
  });
});

describe("WindowManager", () => {
  it("opens, focuses and reports z-order", () => {
    const windows = new WindowManager({ width: 1000, height: 800 });
    windows.open("a", { geometry: { x: 10, y: 10, width: 300, height: 200 } });
    windows.open("b", { geometry: { x: 40, y: 40, width: 300, height: 200 } });

    expect(windows.windows.map((record) => record.id)).toEqual(["a", "b"]);
    expect(windows.active("b")).toBe(true);
    expect(windows.zIndex("b")).toBe(2);

    windows.focus("a");
    expect(windows.zOrder).toEqual(["b", "a"]);
    expect(windows.active("a")).toBe(true);
    expect(windows.zIndex("a")).toBe(2);
  });

  it("clamps moves and resizes", () => {
    const windows = new WindowManager({ width: 1000, height: 800 });
    windows.open("a", { geometry: { x: 10, y: 10, width: 300, height: 200 } });

    windows.move("a", 2000, 2000);
    expect(windows.record("a")?.geometry).toEqual({ x: 700, y: 600, width: 300, height: 200 });

    windows.resize("a", 10, 10);
    expect(windows.record("a")?.geometry).toEqual({ x: 700, y: 600, width: 160, height: 70 });
  });

  it("maximizes and restores the previous geometry", () => {
    const windows = new WindowManager({ width: 1000, height: 800 });
    windows.open("a", { geometry: { x: 100, y: 80, width: 400, height: 300 } });

    windows.toggleMaximize("a");
    expect(windows.record("a")?.geometry).toEqual({ x: 0, y: 0, width: 1000, height: 800 });
    expect(windows.record("a")?.state.maximized).toBe(true);

    windows.toggleMaximize("a");
    expect(windows.record("a")?.geometry).toEqual({ x: 100, y: 80, width: 400, height: 300 });
    expect(windows.record("a")?.state.maximized).toBe(false);
  });

  it("snaps to half screen and clamps after viewport changes", () => {
    const windows = new WindowManager({ width: 1000, height: 800 });
    windows.open("a", { geometry: { x: 100, y: 80, width: 400, height: 300 } });

    windows.snap("a", "left");
    expect(windows.record("a")?.geometry).toEqual({ x: 0, y: 0, width: 500, height: 800 });

    windows.snap("a", "right");
    expect(windows.record("a")?.geometry).toEqual({ x: 500, y: 0, width: 500, height: 800 });

    windows.setViewport({ width: 800, height: 600 });
    expect(windows.record("a")?.geometry).toEqual({ x: 300, y: 0, width: 500, height: 600 });
  });

  it("closes windows and rejects duplicate ids", () => {
    const windows = new WindowManager();
    windows.open("a", { geometry: { x: 0, y: 0, width: 300, height: 200 } });
    expect(() => windows.open("a", { geometry: { x: 0, y: 0, width: 300, height: 200 } }))
      .toThrow(/already open/);

    windows.close("a");
    expect(windows.has("a")).toBe(false);
    expect(windows.windows).toEqual([]);
  });
});

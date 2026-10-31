import { createComputed, createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import { createDeepSignal, deepEqual } from "../src/signals";

describe("deepEqual", () => {
  it("compares primitives and arrays structurally", () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual([1, 2], [1, 2])).toBe(true);
    expect(deepEqual([1, 2], [1, 3])).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
  });

  it("compares nested objects, dates and maps", () => {
    expect(deepEqual({ a: { b: [1, { c: 2 }] } }, { a: { b: [1, { c: 2 }] } })).toBe(true);
    expect(deepEqual(new Date(0), new Date(0))).toBe(true);
    expect(deepEqual(new Date(0), new Date(1))).toBe(false);
    expect(deepEqual(new Map([["a", { b: 1 }]]), new Map([["a", { b: 1 }]]))).toBe(true);
  });

  it("keeps class instances identity-based", () => {
    class Point {
      constructor(readonly x: number) {}
    }
    expect(deepEqual(new Point(1), new Point(1))).toBe(false);
    const point = new Point(1);
    expect(deepEqual(point, point)).toBe(true);
  });
});

describe("createDeepSignal", () => {
  it("does not wake effects when an equal structural value is written", () => {
    createRoot((dispose) => {
      const [state, setState] = createDeepSignal({ count: 0, nested: { label: "a" } });
      let runs = 0;
      createComputed(() => {
        state();
        runs += 1;
      });

      expect(runs).toBe(1);
      setState({ count: 0, nested: { label: "a" } });
      expect(runs).toBe(1);
      setState({ count: 1, nested: { label: "a" } });
      expect(runs).toBe(2);
      dispose();
    });
  });
});

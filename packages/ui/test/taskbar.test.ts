import { describe, expect, it } from "vitest";
import { msUntilNextMinute } from "../src/desktop/clock";

describe("msUntilNextMinute", () => {
  it("aligns the clock refresh to the next minute boundary", () => {
    expect(msUntilNextMinute(new Date(2026, 0, 1, 12, 34, 15, 250))).toBe(44_750);
    expect(msUntilNextMinute(new Date(2026, 0, 1, 12, 34, 59, 999))).toBe(1);
    expect(msUntilNextMinute(new Date(2026, 0, 1, 12, 34, 0, 0))).toBe(60_000);
  });
});

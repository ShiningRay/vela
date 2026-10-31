import { describe, expect, it } from "vitest";
import { normalizeCombo } from "../src/hotkeys";

function combo(key: string, modifiers: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...modifiers,
  } as KeyboardEvent;
}

describe("normalizeCombo", () => {
  it("normalizes the space bar to a stable name", () => {
    expect(normalizeCombo(combo(" ", { metaKey: true }))).toBe("Meta+Space");
    expect(normalizeCombo(combo("Spacebar"))).toBe("Space");
  });

  it("orders modifiers and uppercases printable keys", () => {
    expect(normalizeCombo(combo("w", { metaKey: true }))).toBe("Meta+W");
    expect(normalizeCombo(combo("m", { ctrlKey: true, shiftKey: true }))).toBe("Ctrl+Shift+M");
    expect(normalizeCombo(combo("Escape"))).toBe("Escape");
  });
});

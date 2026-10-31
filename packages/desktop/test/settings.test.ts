// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { defaultSettings, normalizeHotkey, SettingsStore } from "../src/settings";

function memoryStorage(): { getItem(key: string): string | null; setItem(key: string, value: string): void } {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe("SettingsStore", () => {
  it("loads defaults and persists accent, wallpaper and hotkeys", () => {
    const storage = memoryStorage();
    const store = new SettingsStore(storage);
    expect(store.settings.accent).toBe(defaultSettings().accent);
    expect(store.settings.wallpaper).toBe("aurora");
    expect(store.settings.marketplaceUrl).toBe(defaultSettings().marketplaceUrl);

    store.update({
      accent: "#f472b6",
      wallpaper: "sunset",
      marketplaceUrl: "http://127.0.0.1:9999",
      hotkeys: { launcher: "Ctrl+L" },
    });
    expect(document.documentElement.style.getPropertyValue("--vela-color-accent")).toBe("#f472b6");
    expect(document.documentElement.style.getPropertyValue("--vela-wallpaper")).toContain("1c1917");

    const reloaded = new SettingsStore(storage);
    expect(reloaded.settings.accent).toBe("#f472b6");
    expect(reloaded.settings.wallpaper).toBe("sunset");
    expect(reloaded.settings.marketplaceUrl).toBe("http://127.0.0.1:9999");
    expect(reloaded.settings.hotkeys.launcher).toBe("Ctrl+L");
  });

  it("normalizes hotkeys and ignores blanks", () => {
    expect(normalizeHotkey("ctrl + alt + p")).toBe("Ctrl+Alt+P");
    expect(normalizeHotkey("meta+ ")).toBe("Meta+Space");
    expect(normalizeHotkey("shift+space")).toBe("Shift+Space");

    const store = new SettingsStore(memoryStorage());
    const previous = store.settings.hotkeys.close;
    store.setHotkey("close", "   ");
    expect(store.settings.hotkeys.close).toBe(previous);
  });

  it("resets to defaults", () => {
    const store = new SettingsStore(memoryStorage());
    store.update({ accent: "#000000", wallpaper: "paper" });
    store.reset();
    expect(store.settings).toEqual(defaultSettings());
  });
});

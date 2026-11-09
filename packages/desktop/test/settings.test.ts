// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { ConfigStore, MemoryVfs } from "@vela/core";
import {
  defaultSettings,
  migrateLegacySettings,
  normalizeHotkey,
  SettingsStore,
} from "../src/settings";

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

  it("uses the config scope when provided and does not touch localStorage", () => {
    const storage = memoryStorage();
    const vfs = new MemoryVfs();
    const config = new ConfigStore(vfs);
    const store = new SettingsStore(storage, config);

    store.update({
      accent: "#f472b6",
      wallpaper: "sunset",
      marketplaceUrl: "http://127.0.0.1:9999",
      hotkeys: { launcher: "Ctrl+L" },
    });

    expect(vfs.read("/Config/system.json")).toContain('"#f472b6"');
    expect(storage.getItem("vela.desktop.settings.v1")).toBeNull();

    const reloaded = new SettingsStore(undefined, new ConfigStore(vfs));
    expect(reloaded.settings.accent).toBe("#f472b6");
    expect(reloaded.settings.wallpaper).toBe("sunset");
    expect(reloaded.settings.marketplaceUrl).toBe("http://127.0.0.1:9999");
    expect(reloaded.settings.hotkeys.launcher).toBe("Ctrl+L");

    reloaded.reset();
    expect(reloaded.settings).toEqual(defaultSettings());
    expect(vfs.read("/Config/system.json")).toContain('"aurora"');
  });

  it("migrates legacy localStorage once and keeps the old key", async () => {
    const storage = memoryStorage();
    const raw = JSON.stringify({
      accent: "#f472b6",
      wallpaper: "sunset",
      marketplaceUrl: "http://127.0.0.1:9999",
      hotkeys: {
        launcher: "Ctrl+L",
        close: "Ctrl+W",
        minimize: "Ctrl+M",
        quit: "Ctrl+Q",
      },
    });
    storage.setItem("vela.desktop.settings.v1", raw);
    const config = new ConfigStore(new MemoryVfs());

    await expect(migrateLegacySettings(storage, config)).resolves.toBe(true);
    const store = new SettingsStore(undefined, config);
    expect(store.settings.accent).toBe("#f472b6");
    expect(store.settings.hotkeys.launcher).toBe("Ctrl+L");
    expect(storage.getItem("vela.desktop.settings.v1")).toBe(raw);

    await expect(migrateLegacySettings(storage, config)).resolves.toBe(false);
    store.update({ accent: "#000000" });
    await expect(migrateLegacySettings(storage, config)).resolves.toBe(false);
    expect(store.settings.accent).toBe("#000000");
  });

  it("writes the system file even when legacy settings equal defaults", async () => {
    const storage = memoryStorage();
    storage.setItem("vela.desktop.settings.v1", JSON.stringify(defaultSettings()));
    const config = new ConfigStore(new MemoryVfs());

    await expect(migrateLegacySettings(storage, config)).resolves.toBe(true);
    await expect(migrateLegacySettings(storage, config)).resolves.toBe(false);
  });

  it("does not migrate a corrupt legacy key and falls back to defaults", async () => {
    const storage = memoryStorage();
    storage.setItem("vela.desktop.settings.v1", "{not json");
    const config = new ConfigStore(new MemoryVfs());

    await expect(migrateLegacySettings(storage, config)).resolves.toBe(false);
    const store = new SettingsStore(undefined, config);
    expect(store.settings).toEqual(defaultSettings());
  });
});

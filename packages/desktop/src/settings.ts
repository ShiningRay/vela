import { createSignal } from "solid-js";
import { deepEqual } from "@vela/core";
import { applyTheme, tokens } from "@vela/theme";

export type HotkeyAction = "launcher" | "close" | "minimize" | "quit";

export interface DesktopSettings {
  accent: string;
  wallpaper: WallpaperId;
  marketplaceUrl: string;
  hotkeys: Record<HotkeyAction, string>;
}

export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const WALLPAPERS = {
  aurora:
    "radial-gradient(circle at 20% 20%, #1d4ed8 0%, transparent 45%), radial-gradient(circle at 80% 10%, #0e7490 0%, transparent 40%), linear-gradient(160deg, #0f172a 0%, #111827 60%, #020617 100%)",
  midnight:
    "radial-gradient(circle at 70% 10%, #312e81 0%, transparent 45%), linear-gradient(160deg, #020617 0%, #0f172a 55%, #1e1b4b 100%)",
  sunset:
    "radial-gradient(circle at 15% 15%, #be123c 0%, transparent 45%), radial-gradient(circle at 85% 20%, #c2410c 0%, transparent 40%), linear-gradient(160deg, #1c1917 0%, #292524 60%, #0c0a09 100%)",
  paper:
    "radial-gradient(circle at 20% 10%, #e2e8f0 0%, transparent 50%), linear-gradient(160deg, #f8fafc 0%, #e2e8f0 100%)",
} as const;

export type WallpaperId = keyof typeof WALLPAPERS;

export const DEFAULT_MARKETPLACE_URL = "http://127.0.0.1:4320";

export const HOTKEY_ACTIONS: Array<{ id: HotkeyAction; label: string }> = [
  { id: "launcher", label: "Launcher" },
  { id: "close", label: "Close window" },
  { id: "minimize", label: "Minimize window" },
  { id: "quit", label: "Quit" },
];

const STORAGE_KEY = "vela.desktop.settings.v1";

function defaultModifier(): string {
  if (typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)) {
    return "Meta";
  }
  return "Ctrl";
}

export function defaultSettings(): DesktopSettings {
  const modifier = defaultModifier();
  return {
    accent: tokens.color.accent,
    wallpaper: "aurora",
    marketplaceUrl: DEFAULT_MARKETPLACE_URL,
    hotkeys: {
      launcher: `${modifier}+Space`,
      close: `${modifier}+W`,
      minimize: `${modifier}+M`,
      quit: `${modifier}+Q`,
    },
  };
}

export function normalizeHotkey(combo: string): string {
  const trimmed = combo.trim();
  if (!trimmed) return "";
  const trailingPlus = trimmed.endsWith("+");
  const parts = trimmed
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  if (trailingPlus) parts.push("Space");
  if (parts.length === 0) return "";
  const key = parts.pop() ?? "";
  const modifiers = parts.map((part) => part.toLowerCase());
  const ordered = ["meta", "ctrl", "alt", "shift"]
    .filter((modifier) => modifiers.includes(modifier))
    .map((modifier) => modifier[0]!.toUpperCase() + modifier.slice(1));
  const normalizedKey = key === " " || key.toLowerCase() === "space" ? "Space" : key.toUpperCase();
  return [...ordered, normalizedKey].join("+");
}

function readSettings(storage?: SettingsStorage): DesktopSettings {
  const fallback = defaultSettings();
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<DesktopSettings>;
    const hotkeys = { ...fallback.hotkeys };
    if (parsed.hotkeys && typeof parsed.hotkeys === "object") {
      for (const action of HOTKEY_ACTIONS) {
        const value = parsed.hotkeys[action.id];
        if (typeof value === "string" && value.trim()) hotkeys[action.id] = value;
      }
    }
    return {
      accent: typeof parsed.accent === "string" && parsed.accent ? parsed.accent : fallback.accent,
      wallpaper:
        typeof parsed.wallpaper === "string" && parsed.wallpaper in WALLPAPERS
          ? (parsed.wallpaper as WallpaperId)
          : fallback.wallpaper,
      marketplaceUrl:
        typeof parsed.marketplaceUrl === "string" && parsed.marketplaceUrl.trim()
          ? parsed.marketplaceUrl.trim()
          : fallback.marketplaceUrl,
      hotkeys,
    };
  } catch {
    return fallback;
  }
}

export class SettingsStore {
  readonly #signal: readonly [
    () => DesktopSettings,
    (value: DesktopSettings | ((prev: DesktopSettings) => DesktopSettings)) => DesktopSettings,
  ];
  readonly #storage: SettingsStorage | undefined;

  constructor(storage?: SettingsStorage) {
    this.#storage =
      storage ??
      (typeof localStorage === "undefined" ? undefined : localStorage);
    this.#signal = createSignal<DesktopSettings>(readSettings(this.#storage), {
      equals: deepEqual,
    });
    this.apply();
  }

  get settings(): DesktopSettings {
    return this.#signal[0]();
  }

  update(patch: Partial<Omit<DesktopSettings, "hotkeys">> & { hotkeys?: Partial<DesktopSettings["hotkeys"]> }): void {
    const current = this.settings;
    const next: DesktopSettings = {
      ...current,
      ...patch,
      hotkeys: { ...current.hotkeys, ...patch.hotkeys },
    };
    this.#signal[1](next);
    this.#persist(next);
    this.apply();
  }

  setHotkey(action: HotkeyAction, combo: string): void {
    this.update({ hotkeys: { [action]: normalizeHotkey(combo) || this.settings.hotkeys[action] } });
  }

  reset(): void {
    const next = defaultSettings();
    this.#signal[1](next);
    this.#persist(next);
    this.apply();
  }

  apply(): void {
    if (typeof document === "undefined") return;
    const settings = this.settings;
    applyTheme(document.documentElement, { accent: settings.accent });
    document.documentElement.style.setProperty("--vela-wallpaper", WALLPAPERS[settings.wallpaper]);
  }

  #persist(settings: DesktopSettings): void {
    try {
      this.#storage?.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // A full or blocked storage should not break the desktop session.
    }
  }
}

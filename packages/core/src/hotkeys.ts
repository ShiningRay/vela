export type HotkeyHandler = (event: KeyboardEvent) => void;

export function normalizeCombo(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Meta");
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  parts.push(key);
  return parts.join("+");
}

/**
 * Window-level hotkeys, borrowed from Emerald's Hotkey registry.
 * Attach explicitly; the registry never touches `window` on construction,
 * which keeps it usable in Node tests and SSR.
 */
export class HotkeyRegistry {
  readonly #handlers = new Map<string, HotkeyHandler>();
  #target: Window | null = null;
  #listener: ((event: KeyboardEvent) => void) | null = null;

  get size(): number {
    return this.#handlers.size;
  }

  register(combo: string, handler: HotkeyHandler): void {
    this.#handlers.set(combo, handler);
  }

  unregister(combo: string): void {
    this.#handlers.delete(combo);
  }

  attach(target: Window): void {
    this.detach();
    this.#target = target;
    this.#listener = (event: KeyboardEvent) => {
      const handler = this.#handlers.get(normalizeCombo(event));
      if (!handler) return;
      event.preventDefault();
      handler(event);
    };
    target.addEventListener("keydown", this.#listener);
  }

  detach(): void {
    if (this.#target && this.#listener) {
      this.#target.removeEventListener("keydown", this.#listener);
    }
    this.#target = null;
    this.#listener = null;
  }
}

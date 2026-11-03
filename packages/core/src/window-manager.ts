import { createSignal } from "solid-js";
import type { Geometry, SnapZone, Viewport } from "./types";

export interface WindowState {
  minimized: boolean;
  maximized: boolean;
  restore: Geometry | null;
}

export type WindowKind = "window" | "widget";

export interface WindowRecord {
  id: string;
  /** Application that owns this window. Several windows may share one appId. */
  appId: string;
  title: string;
  geometry: Geometry;
  state: WindowState;
  minWidth: number;
  minHeight: number;
  /** Windows render normally; widgets skip taskbar registration and chrome. */
  kind: WindowKind;
  /** False renders the frame without title bar, controls or resize handle. */
  decorations: boolean;
}

export interface OpenWindowOptions {
  /** Defaults to the window id, preserving the original single-instance behaviour. */
  appId?: string;
  title?: string;
  geometry: Geometry;
  minWidth?: number;
  minHeight?: number;
  kind?: WindowKind;
  decorations?: boolean;
}

type Signal<T> = readonly [
  () => T,
  (value: T | ((prev: T) => T)) => T,
];

export const DEFAULT_MIN_WIDTH = 160;
export const DEFAULT_MIN_HEIGHT = 70;
export const SNAP_EDGE = 8;

export function clampGeometry(
  geometry: Geometry,
  viewport: Viewport,
  minWidth = DEFAULT_MIN_WIDTH,
  minHeight = DEFAULT_MIN_HEIGHT,
): Geometry {
  const width = Math.max(minWidth, Math.min(geometry.width, viewport.width));
  const height = Math.max(minHeight, Math.min(geometry.height, viewport.height));
  const x = Math.max(0, Math.min(geometry.x, viewport.width - width));
  const y = Math.max(0, Math.min(geometry.y, viewport.height - height));
  return { x, y, width, height };
}

export function halfGeometry(side: "left" | "right", viewport: Viewport): Geometry {
  const width = Math.round(viewport.width / 2);
  return {
    x: side === "left" ? 0 : viewport.width - width,
    y: 0,
    width,
    height: viewport.height,
  };
}

/**
 * Window manager, ported from Beryl's WindowManager.
 *
 * The important part is not the geometry math: it is the contract that every
 * mutation goes through a signal, so any view that reads `windows()` updates
 * by itself. Views never re-render the whole desktop tree.
 */
export class WindowManager {
  readonly #records: Signal<WindowRecord[]>;
  readonly #order: Signal<string[]>;
  readonly #focused: Signal<boolean>;
  #viewport: Viewport;

  constructor(viewport: Viewport = { width: 1280, height: 800 }) {
    this.#viewport = viewport;
    this.#records = createSignal<WindowRecord[]>([]);
    this.#order = createSignal<string[]>([]);
    this.#focused = createSignal(true);
  }

  get viewport(): Viewport {
    return this.#viewport;
  }

  /**
   * Whether the desktop itself has focus. A browser window that loses focus
   * (another app, another window) must stop pretending one of its windows is
   * active; the window stack itself is kept intact for the restore path.
   */
  get focused(): boolean {
    return this.#focused[0]();
  }

  get windows(): WindowRecord[] {
    const records = this.#records[0]();
    return this.#order[0]()
      .map((id) => records.find((record) => record.id === id))
      .filter((record): record is WindowRecord => record !== undefined);
  }

  get zOrder(): string[] {
    return this.#order[0]();
  }

  /** Topmost non-minimized window id, or undefined while the desktop is blurred. */
  get activeWindowId(): string | undefined {
    if (!this.focused) return undefined;
    const order = this.#order[0]();
    for (let index = order.length - 1; index >= 0; index -= 1) {
      const id = order[index];
      const record = id ? this.record(id) : undefined;
      if (record && !record.state.minimized) return record.id;
    }
    return undefined;
  }

  record(id: string): WindowRecord | undefined {
    return this.#records[0]().find((record) => record.id === id);
  }

  has(id: string): boolean {
    return this.record(id) !== undefined;
  }

  windowsFor(appId: string): WindowRecord[] {
    return this.windows.filter((record) => record.appId === appId);
  }

  open(id: string, options: OpenWindowOptions): WindowRecord {
    if (this.has(id)) {
      throw new Error(`Window "${id}" is already open.`);
    }

    const record: WindowRecord = {
      id,
      appId: options.appId ?? id,
      title: options.title ?? id,
      geometry: clampGeometry(
        options.geometry,
        this.#viewport,
        options.minWidth ?? DEFAULT_MIN_WIDTH,
        options.minHeight ?? DEFAULT_MIN_HEIGHT,
      ),
      state: { minimized: false, maximized: false, restore: null },
      minWidth: options.minWidth ?? DEFAULT_MIN_WIDTH,
      minHeight: options.minHeight ?? DEFAULT_MIN_HEIGHT,
      kind: options.kind ?? "window",
      decorations: options.decorations ?? true,
    };

    this.#records[1]((records) => [...records, record]);
    this.#order[1]((order) => [...order, id]);
    this.#focused[1](true);
    return record;
  }

  close(id: string): void {
    this.#records[1]((records) => records.filter((record) => record.id !== id));
    this.#order[1]((order) => order.filter((current) => current !== id));
  }

  focus(id: string): void {
    if (!this.has(id)) return;
    this.#focused[1](true);
    this.#order[1]((order) => [...order.filter((current) => current !== id), id]);
  }

  /** Drop the active-window state when the desktop loses OS focus. */
  blur(): void {
    this.#focused[1](false);
  }

  /** Restore the previous z-order when the desktop regains OS focus. */
  restoreFocus(): void {
    this.#focused[1](true);
  }

  active(id: string): boolean {
    return this.activeWindowId === id;
  }

  zIndex(id: string): number {
    const index = this.#order[0]().indexOf(id);
    return index === -1 ? 0 : index + 1;
  }

  move(id: string, x: number, y: number): void {
    this.#update(id, (record) => {
      if (record.state.maximized) return record;
      return {
        ...record,
        geometry: clampGeometry(
          { ...record.geometry, x, y },
          this.#viewport,
          record.minWidth,
          record.minHeight,
        ),
      };
    });
  }

  resize(id: string, width: number, height: number, x?: number, y?: number): void {
    this.#update(id, (record) => {
      if (record.state.maximized) return record;
      return {
        ...record,
        geometry: clampGeometry(
          {
            x: x ?? record.geometry.x,
            y: y ?? record.geometry.y,
            width,
            height,
          },
          this.#viewport,
          record.minWidth,
          record.minHeight,
        ),
      };
    });
  }

  minimize(id: string): void {
    this.#update(id, (record) => ({
      ...record,
      state: { ...record.state, minimized: true },
    }));
  }

  restore(id: string): void {
    this.#update(id, (record) => ({
      ...record,
      state: { ...record.state, minimized: false },
    }));
    this.focus(id);
  }

  toggleMinimize(id: string): void {
    const record = this.record(id);
    if (!record) return;
    if (record.state.minimized) this.restore(id);
    else this.minimize(id);
  }

  toggleMaximize(id: string): void {
    this.#update(id, (record) => {
      if (record.state.maximized) {
        const geometry = record.state.restore
          ? clampGeometry(record.state.restore, this.#viewport, record.minWidth, record.minHeight)
          : record.geometry;
        return {
          ...record,
          geometry,
          state: { ...record.state, maximized: false, restore: null },
        };
      }

      return {
        ...record,
        geometry: { x: 0, y: 0, width: this.#viewport.width, height: this.#viewport.height },
        state: { ...record.state, maximized: true, restore: record.geometry, minimized: false },
      };
    });
  }

  snap(id: string, zone: SnapZone): void {
    this.#update(id, (record) => {
      const restore = record.state.restore ?? record.geometry;
      if (zone === "top") {
        return {
          ...record,
          geometry: { x: 0, y: 0, width: this.#viewport.width, height: this.#viewport.height },
          state: { ...record.state, maximized: true, restore, minimized: false },
        };
      }

      return {
        ...record,
        geometry: clampGeometry(halfGeometry(zone, this.#viewport), this.#viewport, record.minWidth, record.minHeight),
        state: { ...record.state, maximized: false, restore, minimized: false },
      };
    });
  }

  setViewport(viewport: Viewport): void {
    this.#viewport = viewport;
    this.#records[1]((records) =>
      records.map((record) => ({
        ...record,
        geometry: record.state.maximized
          ? { x: 0, y: 0, width: viewport.width, height: viewport.height }
          : clampGeometry(record.geometry, viewport, record.minWidth, record.minHeight),
      })),
    );
  }

  #update(id: string, updater: (record: WindowRecord) => WindowRecord): void {
    this.#records[1]((records) => {
      const index = records.findIndex((record) => record.id === id);
      if (index === -1) return records;
      const current = records[index];
      if (!current) return records;
      const next = records.slice();
      next[index] = updater(current);
      return next;
    });
  }
}

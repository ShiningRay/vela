export { AppRegistry } from "./app-registry";
export type { AppDefinition } from "./app-registry";

export { CommandRegistry } from "./commands";
export type { Command } from "./commands";

export { HotkeyRegistry, normalizeCombo } from "./hotkeys";
export type { HotkeyHandler } from "./hotkeys";

export { NotificationCenter } from "./notifications";
export type { Notification } from "./notifications";

export { batch, createDeepSignal, deepEqual, untrack } from "./signals";

export { baseName, MemoryVfs, normalizePath, parentPath } from "./vfs";
export type { Vfs, VfsEntry, VfsEntryKind } from "./vfs";

export {
  clampGeometry,
  DEFAULT_MIN_HEIGHT,
  DEFAULT_MIN_WIDTH,
  halfGeometry,
  SNAP_EDGE,
  WindowManager,
} from "./window-manager";
export type { OpenWindowOptions, WindowRecord, WindowState } from "./window-manager";

export type { Geometry, SnapZone, Viewport } from "./types";

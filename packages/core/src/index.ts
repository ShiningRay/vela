export { AppRegistry } from "./app-registry";
export type { AppDefinition } from "./app-registry";

export { ConfigError, ConfigStore } from "./config-store";
export type {
  ConfigErrorCode,
  ConfigSchema,
  ConfigScope,
  ConfigScopeId,
} from "./config-store";

export { CommandRegistry } from "./commands";
export type { Command } from "./commands";

export {
  MAX_CHART_ROWS,
  chartSpecJsonSchema,
  formatChartValue,
  isIso8601,
  validateChartSpec,
} from "./chart-spec";
export type {
  ChartEncoding,
  ChartKind,
  ChartRow,
  ChartSpec,
  ChartSpecError,
  ChartSpecErrorCode,
  ChartSpecValidation,
  ChartXType,
} from "./chart-spec";

export { HotkeyRegistry, normalizeCombo } from "./hotkeys";
export type { HotkeyHandler } from "./hotkeys";

export { DEFAULT_NOTIFICATION_TIMEOUT, NotificationCenter } from "./notifications";
export type { Notification, NotificationCenterOptions, NotificationOptions } from "./notifications";

export { batch, createDeepSignal, deepEqual, untrack } from "./signals";

export { baseName, defaultVfsEntries, MemoryVfs, normalizePath, parentPath } from "./vfs";
export type { Vfs, VfsEntry, VfsEntryKind, VfsSeed } from "./vfs";

export { IndexedDbVfs, openPersistentVfs } from "./indexeddb-vfs";
export type { IndexedDbVfsOptions } from "./indexeddb-vfs";

export {
  clampGeometry,
  DEFAULT_MIN_HEIGHT,
  DEFAULT_MIN_WIDTH,
  halfGeometry,
  SNAP_EDGE,
  WindowManager,
} from "./window-manager";
export type { OpenWindowOptions, WindowKind, WindowRecord, WindowState } from "./window-manager";

export { SurfaceError, SurfaceRegistry } from "./surface";
export type {
  SurfaceContent,
  SurfaceCreateInput,
  SurfaceErrorCode,
  SurfaceKind,
  SurfacePatchInput,
  SurfaceRecord,
  SurfaceRegistryOptions,
} from "./surface";

export type { Geometry, SnapZone, Viewport } from "./types";

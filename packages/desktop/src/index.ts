export { DesktopShell } from "./shell";
export type { DesktopShellProps } from "./shell";

export { DesktopContext, useDesktop } from "./context";
export type { DesktopServices } from "./context";

export { AboutApp } from "./apps/about";
export { EditorApp } from "./apps/editor";
export { FilesApp } from "./apps/files";
export { MarketplaceApp } from "./apps/marketplace";
export { ServiceApp } from "./apps/service";
export { SettingsApp } from "./apps/settings";
export { TerminalApp } from "./apps/terminal";

export {
  defaultSettings,
  HOTKEY_ACTIONS,
  normalizeHotkey,
  SettingsStore,
  WALLPAPERS,
} from "./settings";
export type { DesktopSettings, HotkeyAction, SettingsStorage, WallpaperId } from "./settings";

export {
  installPackage,
  listInstalledPackages,
  PackageApp,
  parseManifest,
  parseVpk,
  readInstalledPackage,
  registerInstalledPackages,
  registerPackageApp,
} from "./packages";
export type { VpkManifest, VpkPackage } from "./packages";

export {
  appendServiceLog,
  DEFAULT_SERVICE_URL,
  serviceConnected,
  serviceHealthy,
  serviceLogs,
  serviceSession,
  serviceUrl,
  serviceWire,
  setServiceHealthy,
  setServiceLogs,
  setServiceUrl,
} from "./services";
export type { ServiceStatus, Task } from "./services";

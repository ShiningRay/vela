export { DesktopShell } from "./shell";
export type { DesktopShellProps } from "./shell";

export { DesktopContext, useDesktop } from "./context";
export type { DesktopServices } from "./context";

export {
  AGENT_DATA_DIR,
  AGENT_DATA_KEY,
  AGENT_NOTIFICATIONS_KEY,
  SURFACES_KEY,
  SURFACE_DIR,
  SurfaceLayer,
  dataKeyFor,
  readPersistedSurfaces,
} from "./surfaces";

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
  migrateLegacySettings,
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
  uninstallPackage,
} from "./packages";
export type { VpkManifest, VpkPackage } from "./packages";

export {
  PACKAGES_PROPOSAL_KEY,
  describePermission,
  parseAgentSection,
  parsePermissions,
  readGrants,
  registerInstalledAgentPackages,
  registerPackageAgent,
  unregisterPackageAgent,
  writeGrants,
} from "./agent-manifest";
export type {
  VpkAgentChartDecl,
  VpkAgentDatasourceDecl,
  VpkAgentSection,
  VpkAgentSurfaceDecl,
  VpkAgentToolDecl,
  VpkGrants,
} from "./agent-manifest";

export { AgentConsentDialog } from "./agent-consent";
export type { AgentConsentDialogProps } from "./agent-consent";

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

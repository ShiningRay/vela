import { createContext, useContext } from "solid-js";
import type {
  AppRegistry,
  CommandRegistry,
  ConfigStore,
  NotificationCenter,
  SurfaceRegistry,
  Vfs,
  WindowManager,
} from "@vela/core";
import type { RemoteSession } from "@vela/remote";
import type { SettingsStore } from "./settings";

export interface DesktopServices {
  windows: WindowManager;
  apps: AppRegistry;
  vfs: Vfs;
  notifications: NotificationCenter;
  commands: CommandRegistry;
  settings: SettingsStore;
  config: ConfigStore;
  /** Agent surface registry; created lazily by the shell when omitted. */
  surfaces?: SurfaceRegistry;
  /** Remote session to the Node service; defaults to the shared singleton. */
  session?: RemoteSession | null;
}

export const DesktopContext = createContext<DesktopServices>();

export function useDesktop(): DesktopServices {
  const services = useContext(DesktopContext);
  if (!services) {
    throw new Error("useDesktop() must be called inside <DesktopShell>.");
  }
  return services;
}

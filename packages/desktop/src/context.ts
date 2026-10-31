import { createContext, useContext } from "solid-js";
import type { AppRegistry, CommandRegistry, NotificationCenter, Vfs, WindowManager } from "@vela/core";

export interface DesktopServices {
  windows: WindowManager;
  apps: AppRegistry;
  vfs: Vfs;
  notifications: NotificationCenter;
  commands: CommandRegistry;
}

export const DesktopContext = createContext<DesktopServices>();

export function useDesktop(): DesktopServices {
  const services = useContext(DesktopContext);
  if (!services) {
    throw new Error("useDesktop() must be called inside <DesktopShell>.");
  }
  return services;
}

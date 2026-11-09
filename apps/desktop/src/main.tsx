import { render } from "solid-js/web";
import { ConfigStore, NotificationCenter, openPersistentVfs } from "@vela/core";
import {
  appendServiceLog,
  DesktopShell,
  migrateLegacySettings,
  SettingsStore,
  setServiceHealthy,
  setServiceLogs,
  setServiceUrl,
} from "@vela/desktop";
import "@vela/theme/tokens.css";
import "@vela/ui/styles.css";
import "@vela/desktop/styles.css";
import "./app.css";

interface SupervisorStatus {
  running: boolean;
  healthy: boolean;
  url: string;
  error: string | null;
}

const vfs = await openPersistentVfs();
const config = new ConfigStore(vfs);
const settingsStorage = typeof localStorage === "undefined" ? undefined : localStorage;
await migrateLegacySettings(settingsStorage, config);
const settings = new SettingsStore(settingsStorage, config);

async function sendSystemNotification(title: string, body?: string): Promise<void> {
  try {
    const { isPermissionGranted, requestPermission, sendNotification } = await import(
      "@tauri-apps/plugin-notification"
    );
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === "granted";
    if (granted) sendNotification({ title, body });
  } catch {
    // Browser preview or a denied permission: the in-app notification remains.
  }
}

const notifications = new NotificationCenter({
  onPush: (notification) => {
    void sendSystemNotification(notification.title, notification.body);
  },
});

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element.");

const quit = (): void => {
  void import("@tauri-apps/api/window")
    .then(({ getCurrentWindow }) => getCurrentWindow().close())
    .catch(() => {
      // Browser previews do not own the window; the shell has already closed
      // every window it manages.
    });
};

async function connectServiceBridge(): Promise<void> {
  try {
    const [{ invoke }, { listen }] = await Promise.all([
      import("@tauri-apps/api/core"),
      import("@tauri-apps/api/event"),
    ]);

    // Register listeners before asking for the current state: the service may
    // become ready (and pick a random port) between the two calls.
    await listen<SupervisorStatus>("service://status", (event) => {
      if (event.payload.url) setServiceUrl(event.payload.url);
      setServiceHealthy(event.payload.healthy);
    });
    await listen<string>("service://log", (event) => appendServiceLog(String(event.payload)));

    const status = await invoke<SupervisorStatus>("service_status");
    if (status.url) setServiceUrl(status.url);
    setServiceHealthy(status.healthy);

    const logs = await invoke<string[]>("service_logs");
    setServiceLogs(logs);

    window.setInterval(() => {
      void invoke<boolean>("service_health")
        .then((healthy) => setServiceHealthy(healthy))
        .catch(() => setServiceHealthy(false));
    }, 4_000);
  } catch {
    // Browser preview: the default localhost URL stays in use and the Service
    // app simply reports that it is waiting for a service.
  }
}

void connectServiceBridge();

render(
  () => <DesktopShell services={{ vfs, settings, notifications, config }} onQuit={quit} />,
  root,
);

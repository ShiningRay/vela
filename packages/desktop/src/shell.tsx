import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import {
  AppRegistry,
  CommandRegistry,
  MemoryVfs,
  NotificationCenter,
  WindowManager,
} from "@vela/core";
import type { AppDefinition } from "@vela/core";
import { DesktopIcon, Label, MenuBar, Taskbar, WindowFrame } from "@vela/ui";
import { AboutApp } from "./apps/about";
import { FilesApp } from "./apps/files";
import { ServiceApp } from "./apps/service";
import { SettingsApp } from "./apps/settings";
import { DesktopContext } from "./context";
import type { DesktopServices } from "./context";

const builtinApps: AppDefinition[] = [
  { id: "about", title: "About Vela", icon: "◆", component: AboutApp, singleton: true },
  { id: "files", title: "Files", icon: "▤", component: FilesApp, singleton: true },
  { id: "service", title: "Service", icon: "◇", component: ServiceApp, singleton: true },
  { id: "settings", title: "Settings", icon: "⚙", component: SettingsApp, singleton: true },
];

export interface DesktopShellProps {
  services?: Partial<DesktopServices>;
}

export function DesktopShell(props: DesktopShellProps) {
  const windows = props.services?.windows ?? new WindowManager({ width: 1280, height: 800 });
  const apps = props.services?.apps ?? new AppRegistry();
  const vfs = props.services?.vfs ?? new MemoryVfs();
  const notifications = props.services?.notifications ?? new NotificationCenter();
  const commands = props.services?.commands ?? new CommandRegistry();

  const services: DesktopServices = { windows, apps, vfs, notifications, commands };

  for (const app of builtinApps) {
    if (!apps.find(app.id)) apps.register(app);
  }

  const [selected, setSelected] = createSignal<string | null>(null);
  const [launcherOpen, setLauncherOpen] = createSignal(false);

  const activeId = () => {
    const order = windows.zOrder;
    return order[order.length - 1];
  };

  const openApp = (app: AppDefinition) => {
    setLauncherOpen(false);
    if (windows.has(app.id)) {
      windows.restore(app.id);
      windows.focus(app.id);
      return;
    }

    const offset = (windows.windows.length % 6) * 32;
    windows.open(app.id, {
      title: app.title,
      geometry: { x: 120 + offset, y: 72 + offset, width: 640, height: 460 },
    });
  };

  onMount(() => {
    const resize = () => windows.setViewport({ width: window.innerWidth, height: window.innerHeight });
    resize();
    window.addEventListener("resize", resize);

    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLauncherOpen(false);
      if (event.metaKey && event.code === "Space") {
        event.preventDefault();
        setLauncherOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", keydown);

    onCleanup(() => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", keydown);
    });
  });

  const titleOfActive = () => {
    const id = activeId();
    return id ? windows.record(id)?.title ?? "Desktop" : "Desktop";
  };

  return (
    <DesktopContext.Provider value={services}>
      <div class="vela-desktop" onPointerDown={() => setSelected(null)}>
        <MenuBar appTitle={titleOfActive()} onLauncher={() => setLauncherOpen((open) => !open)} />

        <div class="vela-desktop__icons">
          <For each={apps.apps}>
            {(app) => (
              <DesktopIcon
                icon={app.icon}
                label={app.title}
                selected={selected() === app.id}
                onSelect={() => setSelected(app.id)}
                onOpen={() => openApp(app)}
              />
            )}
          </For>
        </div>

        <div class="vela-desktop__layer">
          <For each={windows.windows}>
            {(record) => (
              <WindowFrame
                record={record}
                active={activeId() === record.id}
                zIndex={windows.zIndex(record.id)}
                onFocus={() => windows.focus(record.id)}
                onMove={(x, y) => windows.move(record.id, x, y)}
                onResize={(width, height) => windows.resize(record.id, width, height)}
                onMinimize={() => windows.minimize(record.id)}
                onMaximize={() => windows.toggleMaximize(record.id)}
                onClose={() => windows.close(record.id)}
              >
                <Show when={apps.find(record.id)} fallback={<Label muted>Unknown app</Label>}>
                  {(app) => <Dynamic component={app().component} />}
                </Show>
              </WindowFrame>
            )}
          </For>
        </div>

        <Show when={launcherOpen()}>
          <div class="vela-launcher-panel" onPointerDown={(event) => event.stopPropagation()}>
            <div class="vela-launcher-panel__title">Applications</div>
            <For each={apps.apps}>
              {(app) => (
                <button type="button" class="vela-launcher-panel__item" onClick={() => openApp(app)}>
                  <span class="vela-launcher-panel__icon" aria-hidden="true">
                    {app.icon}
                  </span>
                  <span>{app.title}</span>
                </button>
              )}
            </For>
            <div class="vela-launcher-panel__hint">⌘ Space to toggle</div>
          </div>
        </Show>

        <div class="vela-notifications">
          <For each={notifications.items}>
            {(notification) => (
              <button
                type="button"
                class="vela-notification"
                onClick={() => notifications.dismiss(notification.id)}
              >
                <div class="vela-notification__title">{notification.title}</div>
                <Show when={notification.body}>
                  <div class="vela-notification__body">{notification.body}</div>
                </Show>
              </button>
            )}
          </For>
        </div>

        <Taskbar
          windows={windows.windows}
          activeId={activeId()}
          onLauncher={() => setLauncherOpen((open) => !open)}
          onActivate={(id) => {
            windows.restore(id);
            windows.focus(id);
          }}
          onToggleMinimize={(id) => windows.toggleMinimize(id)}
        />
      </div>
    </DesktopContext.Provider>
  );
}

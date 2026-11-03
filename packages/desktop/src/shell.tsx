import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import {
  AppRegistry,
  CommandRegistry,
  HotkeyRegistry,
  MemoryVfs,
  NotificationCenter,
  SurfaceRegistry,
  WindowManager,
} from "@vela/core";
import type { AppDefinition } from "@vela/core";
import { DesktopIcon, Label, MenuBar, Taskbar, WindowFrame } from "@vela/ui";
import type { MenuDefinition } from "@vela/ui";
import { AboutApp } from "./apps/about";
import { EditorApp } from "./apps/editor";
import { FilesApp } from "./apps/files";
import { MarketplaceApp } from "./apps/marketplace";
import { ServiceApp } from "./apps/service";
import { SettingsApp } from "./apps/settings";
import { TerminalApp } from "./apps/terminal";
import { normalizeHotkey, SettingsStore } from "./settings";
import type { HotkeyAction } from "./settings";
import { registerInstalledPackages, listInstalledPackages } from "./packages";
import { registerInstalledAgentPackages } from "./agent-manifest";
import { serviceSession } from "./services";
import { SurfaceLayer } from "./surfaces";
import { DesktopContext } from "./context";
import type { DesktopServices } from "./context";

const builtinApps: AppDefinition[] = [
  { id: "about", title: "About Vela", icon: "◆", component: AboutApp, singleton: true },
  { id: "files", title: "Files", icon: "▤", component: FilesApp },
  { id: "editor", title: "Editor", icon: "✎", component: EditorApp },
  { id: "terminal", title: "Terminal", icon: "▸", component: TerminalApp },
  { id: "marketplace", title: "Plugin Market", icon: "▩", component: MarketplaceApp, singleton: true, defaultGeometry: { width: 980, height: 640 } },
  { id: "service", title: "Service", icon: "◇", component: ServiceApp },
  { id: "settings", title: "Settings", icon: "⚙", component: SettingsApp, singleton: true },
];

const DESKTOP_CHROME_HEIGHT = 30 + 48;

export interface DesktopShellProps {
  services?: Partial<DesktopServices>;
  /** Supplied by the Tauri entry point; the browser fallback closes all windows. */
  onQuit?: () => void;
}

export function DesktopShell(props: DesktopShellProps) {
  const windows = props.services?.windows ?? new WindowManager({ width: 1280, height: 800 });
  const apps = props.services?.apps ?? new AppRegistry();
  const vfs = props.services?.vfs ?? new MemoryVfs();
  const notifications = props.services?.notifications ?? new NotificationCenter();
  const commands = props.services?.commands ?? new CommandRegistry();
  const settings = props.services?.settings ?? new SettingsStore();
  const surfaces = props.services?.surfaces ?? new SurfaceRegistry({ autoSweepMs: 1_000 });

  // Test/debug hook: lets e2e runs and console debugging inspect live surfaces.
  (window as unknown as { __velaSurfaces?: SurfaceRegistry }).__velaSurfaces = surfaces;

  const services: DesktopServices = { windows, apps, vfs, notifications, commands, settings, surfaces };

  for (const app of builtinApps) {
    if (!apps.find(app.id)) apps.register(app);
  }

  const [selected, setSelected] = createSignal<string | null>(null);
  const [launcherOpen, setLauncherOpen] = createSignal(false);
  const [launcherQuery, setLauncherQuery] = createSignal("");
  const [launcherIndex, setLauncherIndex] = createSignal(0);
  const instanceCounts = new Map<string, number>();
  const hotkeys = new HotkeyRegistry();
  let launcherInput: HTMLInputElement | undefined;

  const activeId = () => windows.activeWindowId;

  const filteredApps = () => {
    const query = launcherQuery().trim().toLowerCase();
    if (!query) return apps.apps;
    return apps.apps.filter(
      (app) => app.title.toLowerCase().includes(query) || app.id.toLowerCase().includes(query),
    );
  };

  createEffect(() => {
    const count = filteredApps().length;
    setLauncherIndex((index) => Math.max(0, Math.min(index, count - 1)));
  });

  createEffect(() => {
    if (!launcherOpen()) return;
    queueMicrotask(() => launcherInput?.focus());
  });

  const openLauncher = (): void => {
    setLauncherQuery("");
    setLauncherIndex(0);
    setLauncherOpen(true);
  };

  const closeLauncher = (): void => {
    setLauncherOpen(false);
  };

  const toggleLauncher = (): void => {
    if (launcherOpen()) closeLauncher();
    else openLauncher();
  };

  const openApp = (app: AppDefinition): AppDefinition | undefined => {
    closeLauncher();
    const existing = windows.windowsFor(app.id);
    if (app.singleton && existing.length > 0) {
      const target = existing[existing.length - 1];
      if (!target) return app;
      windows.restore(target.id);
      windows.focus(target.id);
      return app;
    }

    const instance = (instanceCounts.get(app.id) ?? 0) + 1;
    instanceCounts.set(app.id, instance);
    const id = instance === 1 ? app.id : `${app.id}-${instance}`;
    const offset = (windows.windows.length % 6) * 32;
    const size = app.defaultGeometry ?? { width: 640, height: 460 };
    windows.open(id, {
      appId: app.id,
      title: instance === 1 ? app.title : `${app.title} ${instance}`,
      geometry: { x: 120 + offset, y: 72 + offset, ...size },
    });
    return app;
  };

  const closeActive = (): void => {
    const id = activeId();
    if (id) windows.close(id);
  };

  const minimizeActive = (): void => {
    const id = activeId();
    if (id) windows.minimize(id);
  };

  const maximizeActive = (): void => {
    const id = activeId();
    if (id) windows.toggleMaximize(id);
  };

  const closeAll = (): void => {
    for (const record of [...windows.windows]) windows.close(record.id);
  };

  const quit = (): void => {
    closeAll();
    if (props.onQuit) {
      props.onQuit();
      return;
    }
    notifications.push("Vela", "All windows closed. Quitting is handled by the desktop shell.");
  };

  const openBuiltin = (id: string): void => {
    const app = apps.find(id);
    if (app) openApp(app);
  };

  const registerCommand = (id: string, title: string, run: () => void): void => {
    if (commands.find(id)) return;
    commands.register({ id, title, run });
  };

  registerCommand("desktop.launcher", "Open Launcher", toggleLauncher);
  registerCommand("desktop.close-all", "Close All Windows", closeAll);
  registerCommand("desktop.quit", "Quit", quit);
  registerCommand("window.minimize", "Minimize Window", minimizeActive);
  registerCommand("window.maximize", "Maximize or Restore Window", maximizeActive);
  registerCommand("window.close", "Close Window", closeActive);

  const menus = (): MenuDefinition[] => [
    {
      id: "desktop",
      label: "Desktop",
      items: [
        { id: "launcher", label: "Open Launcher", shortcut: "⌘ Space", action: toggleLauncher },
        { id: "about", label: "About Vela", action: () => openBuiltin("about") },
        { id: "files", label: "Files", action: () => openBuiltin("files") },
        { id: "editor", label: "Editor", action: () => openBuiltin("editor") },
        { id: "terminal", label: "Terminal", action: () => openBuiltin("terminal") },
        { id: "marketplace", label: "Plugin Market", action: () => openBuiltin("marketplace") },
        { id: "settings", label: "Settings", action: () => openBuiltin("settings") },
        {
          id: "close-all",
          label: "Close All Windows",
          disabled: windows.windows.length === 0,
          action: closeAll,
        },
        { id: "quit", label: "Quit", shortcut: "⌘ Q", action: quit },
      ],
    },
    {
      id: "window",
      label: "Window",
      items: [
        {
          id: "minimize",
          label: "Minimize",
          shortcut: "⌘ M",
          disabled: !activeId(),
          action: minimizeActive,
        },
        {
          id: "maximize",
          label: "Maximize / Restore",
          disabled: !activeId(),
          action: maximizeActive,
        },
        {
          id: "close",
          label: "Close",
          shortcut: "⌘ W",
          disabled: !activeId(),
          action: closeActive,
        },
      ],
    },
  ];

  const titleOfActive = () => {
    const id = activeId();
    return id ? windows.record(id)?.title ?? "Desktop" : "Desktop";
  };

  const visibleNotifications = () => notifications.items.slice(-3);

  const onLauncherKeyDown = (event: KeyboardEvent): void => {
    const list = filteredApps();
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (list.length > 0) setLauncherIndex((index) => (index + 1) % list.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (list.length > 0) setLauncherIndex((index) => (index - 1 + list.length) % list.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const app = list[launcherIndex()];
      if (app) openApp(app);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeLauncher();
    }
  };

  const hotkeyHandlers: Record<HotkeyAction, () => void> = {
    launcher: () => commands.run("desktop.launcher"),
    close: () => commands.run("window.close"),
    minimize: () => commands.run("window.minimize"),
    quit: () => commands.run("desktop.quit"),
  };
  let registeredCombos: string[] = [];

  createEffect(() => {
    const bindings = settings.settings.hotkeys;
    for (const combo of registeredCombos) hotkeys.unregister(combo);
    registeredCombos = [];
    for (const action of ["launcher", "close", "minimize", "quit"] as const) {
      const combo = normalizeHotkey(bindings[action]);
      if (!combo) continue;
      hotkeys.register(combo, hotkeyHandlers[action]);
      registeredCombos.push(combo);
    }
  });

  onMount(() => {
    const resize = () =>
      windows.setViewport({
        width: window.innerWidth,
        height: Math.max(160, window.innerHeight - DESKTOP_CHROME_HEIGHT),
      });
    resize();
    window.addEventListener("resize", resize);
    registerInstalledPackages(apps, vfs);
    // Agent-capable packages replay their declarations only when the user
    // granted them at install time (grants.json present).
    registerInstalledAgentPackages(vfs, { surfaces, packages: listInstalledPackages(vfs) });

    const onBlur = () => windows.blur();
    const onFocus = () => windows.restoreFocus();
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);

    hotkeys.register("Escape", closeLauncher);
    hotkeys.attach(window);

    onCleanup(() => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      for (const combo of registeredCombos) hotkeys.unregister(combo);
      hotkeys.unregister("Escape");
      hotkeys.detach();
    });
  });

  return (
    <DesktopContext.Provider value={services}>
      <div
        class="vela-desktop"
        data-desktop-focused={windows.focused ? "true" : "false"}
        onPointerDown={(event) => {
          setSelected(null);
          if (!launcherOpen()) return;
          const target = event.target;
          if (target instanceof Element && target.closest(".vela-launcher-panel, [data-launcher-toggle]")) {
            return;
          }
          closeLauncher();
        }}
      >
        <MenuBar appTitle={titleOfActive()} menus={menus()} onLauncher={toggleLauncher} />

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

        <SurfaceLayer
          surfaces={surfaces}
          apps={apps}
          session={props.services?.session ?? serviceSession}
          vfs={vfs}
          notifications={notifications}
        />

        <div class="vela-desktop__layer">
          <For each={windows.zOrder}>
            {(id) => (
              <Show when={windows.record(id)}>
                {(record) => (
                  <WindowFrame
                    record={record()}
                    active={activeId() === id}
                    zIndex={windows.zIndex(id)}
                    onFocus={() => windows.focus(id)}
                    onMove={(x, y) => windows.move(id, x, y)}
                    onResize={(width, height) => windows.resize(id, width, height)}
                    onSnap={(zone) => windows.snap(id, zone)}
                    onMinimize={() => windows.minimize(id)}
                    onMaximize={() => windows.toggleMaximize(id)}
                    onClose={() => windows.close(id)}
                  >
                    <Show
                      when={apps.find(record().appId)}
                      fallback={<Label muted>Unknown app</Label>}
                    >
                      {(app) => <Dynamic component={app().component} />}
                    </Show>
                  </WindowFrame>
                )}
              </Show>
            )}
          </For>
        </div>

        <Show when={launcherOpen()}>
          <div
            class="vela-launcher-panel"
            role="dialog"
            aria-label="Application launcher"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div class="vela-launcher-panel__title">Applications</div>
            <input
              ref={launcherInput}
              class="vela-input vela-launcher-panel__search"
              type="search"
              placeholder="Search apps…"
              value={launcherQuery()}
              aria-label="Search applications"
              aria-controls="vela-launcher-list"
              aria-activedescendant={
                filteredApps()[launcherIndex()] ? `vela-launcher-option-${filteredApps()[launcherIndex()]!.id}` : undefined
              }
              onInput={(event) => {
                setLauncherQuery(event.currentTarget.value);
                setLauncherIndex(0);
              }}
              onKeyDown={onLauncherKeyDown}
            />
            <div class="vela-launcher-panel__list" id="vela-launcher-list" role="listbox">
              <For each={filteredApps()}>
                {(app, index) => (
                  <button
                    id={`vela-launcher-option-${app.id}`}
                    type="button"
                    class="vela-launcher-panel__item"
                    role="option"
                    aria-selected={index() === launcherIndex()}
                    data-active={index() === launcherIndex() ? "true" : "false"}
                    onPointerEnter={() => setLauncherIndex(index())}
                    onClick={() => openApp(app)}
                  >
                    <span class="vela-launcher-panel__icon" aria-hidden="true">
                      {app.icon}
                    </span>
                    <span>{app.title}</span>
                  </button>
                )}
              </For>
            </div>
            <Show when={filteredApps().length === 0}>
              <div class="vela-launcher-panel__empty">No apps match “{launcherQuery()}”</div>
            </Show>
            <div class="vela-launcher-panel__hint">↑ ↓ navigate · Enter open · Esc close</div>
          </div>
        </Show>

        <div class="vela-notifications" aria-live="polite">
          <For each={visibleNotifications()}>
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
          onLauncher={toggleLauncher}
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

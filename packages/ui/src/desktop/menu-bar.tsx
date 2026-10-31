import { createEffect, createSignal, For, onCleanup, onMount, Show, type JSX } from "solid-js";

export interface MenuItem {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  action: () => void;
}

export interface MenuDefinition {
  id: string;
  label: string;
  items: MenuItem[];
}

export interface MenuBarProps {
  appTitle?: string;
  menus?: MenuDefinition[];
  onLauncher: () => void;
}

export function MenuBar(props: MenuBarProps): JSX.Element {
  const [activeMenu, setActiveMenu] = createSignal<string | null>(null);
  let root: HTMLElement | undefined;
  let dropdown: HTMLDivElement | undefined;

  const close = (): void => {
    setActiveMenu(null);
  };

  createEffect(() => {
    if (!activeMenu() || !dropdown) return;
    queueMicrotask(() => {
      const first = dropdown?.querySelector<HTMLButtonElement>("button:not(:disabled)");
      first?.focus();
    });
  });

  onMount(() => {
    const onPointerDown = (event: PointerEvent): void => {
      if (!activeMenu()) return;
      const target = event.target;
      if (target instanceof Node && root?.contains(target)) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    onCleanup(() => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    });
  });

  const toggle = (id: string): void => {
    setActiveMenu((current) => (current === id ? null : id));
  };

  const run = (item: MenuItem): void => {
    if (item.disabled) return;
    close();
    item.action();
  };

  return (
    <header class="vela-menubar" ref={root}>
      <button
        type="button"
        class="vela-menubar__brand"
        data-launcher-toggle="true"
        onClick={() => props.onLauncher()}
      >
        Vela
      </button>

      <Show when={props.menus?.length}>
        <nav class="vela-menubar__menus" aria-label="Application menu">
          <For each={props.menus}>
            {(menu) => (
              <div class="vela-menubar__menu" data-open={activeMenu() === menu.id ? "true" : "false"}>
                <button
                  type="button"
                  class="vela-menubar__menu-button"
                  aria-haspopup="menu"
                  aria-expanded={activeMenu() === menu.id}
                  onClick={() => toggle(menu.id)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setActiveMenu(menu.id);
                    }
                  }}
                >
                  {menu.label}
                </button>

                <Show when={activeMenu() === menu.id}>
                  <div class="vela-menubar__dropdown" role="menu" ref={dropdown}>
                    <For each={menu.items}>
                      {(item) => (
                        <button
                          type="button"
                          class="vela-menubar__item"
                          role="menuitem"
                          disabled={item.disabled}
                          onClick={() => run(item)}
                        >
                          <span>{item.label}</span>
                          <Show when={item.shortcut}>
                            <span class="vela-menubar__shortcut">{item.shortcut}</span>
                          </Show>
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            )}
          </For>
        </nav>
      </Show>

      <span class="vela-menubar__app">{props.appTitle ?? "Desktop"}</span>

      <div class="vela-menubar__status">
        <span class="vela-menubar__badge">Solid</span>
        <span class="vela-menubar__badge is-muted">Tauri 2</span>
      </div>
    </header>
  );
}

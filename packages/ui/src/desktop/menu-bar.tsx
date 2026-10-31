import type { JSX } from "solid-js";

export interface MenuBarProps {
  appTitle?: string;
  onLauncher: () => void;
}

export function MenuBar(props: MenuBarProps): JSX.Element {
  return (
    <header class="vela-menubar">
      <button type="button" class="vela-menubar__brand" onClick={() => props.onLauncher()}>
        Vela
      </button>
      <span class="vela-menubar__app">{props.appTitle ?? "Desktop"}</span>
      <div class="vela-menubar__status">
        <span class="vela-menubar__badge">Solid</span>
        <span class="vela-menubar__badge is-muted">Tauri 2</span>
      </div>
    </header>
  );
}

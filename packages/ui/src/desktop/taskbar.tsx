import { createSignal, For, onCleanup, onMount, type JSX } from "solid-js";
import type { WindowRecord } from "@vela/core";
import { msUntilNextMinute } from "./clock";

export interface TaskbarProps {
  windows: WindowRecord[];
  activeId?: string;
  onLauncher: () => void;
  onActivate: (id: string) => void;
  onToggleMinimize: (id: string) => void;
}

export function Taskbar(props: TaskbarProps): JSX.Element {
  const [now, setNow] = createSignal(new Date());

  onMount(() => {
    let interval: number | undefined;
    const align = window.setTimeout(() => {
      setNow(new Date());
      interval = window.setInterval(() => setNow(new Date()), 60_000);
    }, msUntilNextMinute());

    onCleanup(() => {
      window.clearTimeout(align);
      if (interval !== undefined) window.clearInterval(interval);
    });
  });

  return (
    <footer class="vela-taskbar">
      <button
        type="button"
        class="vela-launcher"
        data-launcher-toggle="true"
        onClick={() => props.onLauncher()}
      >
        <span class="vela-launcher__mark" aria-hidden="true">◆</span>
        <span>Vela</span>
      </button>

      <div class="vela-taskbar__windows">
        <For each={props.windows}>
          {(record) => (
            <button
              type="button"
              class="vela-taskbar__window"
              data-active={record.id === props.activeId ? "true" : "false"}
              data-minimized={record.state.minimized ? "true" : "false"}
              title={record.title}
              onClick={() =>
                record.id === props.activeId ? props.onToggleMinimize(record.id) : props.onActivate(record.id)
              }
            >
              {record.title}
            </button>
          )}
        </For>
      </div>

      <div class="vela-taskbar__tray">
        <span class="vela-taskbar__clock" aria-label="Clock">
          {now().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </footer>
  );
}

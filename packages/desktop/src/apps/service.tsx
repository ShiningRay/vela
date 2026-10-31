import { createSignal, For, Show } from "solid-js";
import { Button, Label, Row, Stack } from "@vela/ui";
import { SERVICE_URL, serviceSession, serviceWire } from "../services";
import type { ServiceStatus, Task } from "../services";

const initialStatus: ServiceStatus = {
  state: "starting",
  connections: 0,
  uptimeSec: 0,
  pid: 0,
};

export function ServiceApp() {
  const status = serviceSession.signal<ServiceStatus>("service:status", initialStatus);
  const tasks = serviceSession.signal<Task[]>("tasks:list", []);
  const clock = serviceSession.signal<string>("clock", "—");
  const [connected, setConnected] = createSignal(serviceWire.connected);
  const [draft, setDraft] = createSignal("");

  serviceWire.onOpen(() => setConnected(true));
  serviceWire.onClose(() => setConnected(false));

  const currentTasks = () => tasks.get() ?? [];

  const addTask = () => {
    const title = draft().trim();
    if (!title) return;
    tasks.set([
      ...currentTasks(),
      { id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : String(Date.now()), title, done: false },
    ]);
    setDraft("");
  };

  const toggleTask = (id: string) => {
    tasks.set(currentTasks().map((task) => (task.id === id ? { ...task, done: !task.done } : task)));
  };

  const clockText = () => {
    const value = clock();
    if (!value || value === "—") return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString();
  };

  return (
    <Stack gap={14}>
      <Row gap={8}>
        <span class="vela-status-dot" data-online={connected() ? "true" : "false"} />
        <Label>{connected() ? "Connected to service" : "Waiting for service…"}</Label>
        <Label muted>{SERVICE_URL}</Label>
      </Row>

      <Row gap={14}>
        <Label muted>Connections</Label>
        <Label>{status()?.connections ?? 0}</Label>
        <Label muted>Uptime</Label>
        <Label>{status()?.uptimeSec ?? 0}s</Label>
        <Label muted>PID</Label>
        <Label>{status()?.pid ?? 0}</Label>
        <Label muted>Clock</Label>
        <Label>{clockText()}</Label>
      </Row>

      <Row gap={8}>
        <input
          class="vela-input"
          value={draft()}
          placeholder="New task…"
          onInput={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") addTask();
          }}
        />
        <Button variant="primary" onClick={addTask}>
          Add
        </Button>
      </Row>

      <div class="vela-task-list">
        <Show when={currentTasks().length > 0} fallback={<Label muted>No tasks published yet.</Label>}>
          <For each={currentTasks()}>
            {(task) => (
              <button
                type="button"
                class="vela-task-row"
                data-done={task.done ? "true" : "false"}
                onClick={() => toggleTask(task.id)}
              >
                <span class="vela-task-row__check" aria-hidden="true">
                  {task.done ? "✓" : "○"}
                </span>
                <span>{task.title}</span>
              </button>
            )}
          </For>
        </Show>
      </div>

      <Label muted>
        The list is owned by the Node service. Writes are optimistic proposals; the authority broadcasts
        a patch and every connected view converges.
      </Label>
    </Stack>
  );
}

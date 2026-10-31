import { createSignal } from "solid-js";
import { Button, Input, Label, List, Row, Stack } from "@vela/ui";
import {
  serviceConnected,
  serviceHealthy,
  serviceLogs,
  serviceSession,
  serviceUrl,
} from "../services";
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
  const [draft, setDraft] = createSignal("");
  const connected = serviceConnected;
  const healthy = () => serviceHealthy() || connected();
  const logs = serviceLogs;

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

  const taskItems = () =>
    currentTasks().map((task) => ({
      id: task.id,
      label: task.title,
      icon: task.done ? "✓" : "○",
    }));

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
        <Label muted>{serviceUrl()}</Label>
        <Label muted>{healthy() ? "healthy" : "unhealthy"}</Label>
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
        <Input
          aria-label="New task"
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

      <List label="Tasks" items={taskItems()} onSelect={toggleTask} empty="No tasks published yet." />

      <Stack gap={6}>
        <Label>Service log</Label>
        <pre class="vela-service-log">
          {logs().slice(-80).join("\n") || "No service logs yet."}
        </pre>
      </Stack>

      <Label muted>
        The list is owned by the Node service. Writes are optimistic proposals; the authority broadcasts
        a patch and every connected view converges.
      </Label>
    </Stack>
  );
}

import { WebSocketServer, type WebSocket } from "ws";
import { createSource, RemoteHub } from "@vela/remote/hub";
import type { Wire, WireMessage } from "@vela/remote/protocol";

interface Task {
  id: string;
  title: string;
  done: boolean;
}

interface ServiceStatus {
  state: "ready";
  connections: number;
  uptimeSec: number;
  pid: number;
}

const PORT = Number(process.env.VELA_SERVICE_PORT ?? 4317);
const startedAt = Date.now();
let connections = 0;

const tasks = createSource<Task[]>([
  { id: "t1", title: "Wire the remote session", done: true },
  { id: "t2", title: "Start the Node service", done: false },
  { id: "t3", title: "Publish a signal from the authority", done: false },
]);

const status = createSource<ServiceStatus>({
  state: "ready",
  connections: 0,
  uptimeSec: 0,
  pid: process.pid,
});

const clock = createSource(new Date().toISOString());

function publishStatus(): void {
  status.set({
    state: "ready",
    connections,
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    pid: process.pid,
  });
}

class ServerWire implements Wire {
  readonly #socket: WebSocket;
  #messageListener: ((message: WireMessage) => void) | null = null;
  #closeListener: (() => void) | null = null;

  constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.on("message", (data) => {
      try {
        this.#messageListener?.(JSON.parse(String(data)) as WireMessage);
      } catch {
        // Ignore malformed frames from the client.
      }
    });
    socket.on("close", () => this.#closeListener?.());
  }

  send(message: WireMessage): void {
    if (this.#socket.readyState !== 1) return;
    try {
      this.#socket.send(JSON.stringify(message));
    } catch {
      // The socket owner handles close; the hub must not break its signal graph.
    }
  }

  onMessage(listener: (message: WireMessage) => void): void {
    this.#messageListener = listener;
  }

  onClose(listener: () => void): void {
    this.#closeListener = listener;
  }
}

function isTask(value: unknown): value is Task {
  if (typeof value !== "object" || value === null) return false;
  const task = value as Record<string, unknown>;
  return typeof task.id === "string" && typeof task.title === "string" && typeof task.done === "boolean";
}

function originAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  if (origin === "tauri://localhost" || origin === "http://tauri.localhost") return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function handleProposal(message: WireMessage): void {
  if (message.kind !== "propose") return;

  if (message.key === "tasks:list" && Array.isArray(message.value)) {
    const next = message.value.filter(isTask);
    if (next.length === message.value.length) tasks.set(next);
    return;
  }

  if (message.key === "service:ping") publishStatus();
}

const server = new WebSocketServer({ host: "127.0.0.1", port: PORT });

server.on("connection", (socket, request) => {
  const origin = typeof request.headers.origin === "string" ? request.headers.origin : undefined;
  if (!originAllowed(origin)) {
    socket.close(1008, "origin not allowed");
    return;
  }

  connections += 1;
  publishStatus();

  const wire = new ServerWire(socket);
  const hub = new RemoteHub(wire);
  hub.watch("tasks:list", tasks);
  hub.watch("service:status", status);
  hub.watch("clock", clock);
  wire.onMessage(handleProposal);

  socket.on("close", () => {
    connections = Math.max(0, connections - 1);
    publishStatus();
    hub.dispose();
  });
  socket.on("error", () => {
    // Close follows; do not crash the service on a broken client.
  });
});

server.on("listening", () => {
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : PORT;
  console.log(`READY ${JSON.stringify({ port, url: `ws://127.0.0.1:${port}` })}`);
});

server.on("error", (error) => {
  console.error(`SERVICE ERROR ${error.message}`);
  process.exitCode = 1;
});

const clockTimer = setInterval(() => {
  clock.set(new Date().toISOString());
  publishStatus();
}, 1000);
clockTimer.unref();

function shutdown(): void {
  clearInterval(clockTimer);
  for (const client of server.clients) {
    client.close(1001, "service shutting down");
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Parent watchdog: Tauri keeps the child's stdin open. If the desktop app
// exits abruptly (SIGKILL / crash), the pipe closes and the service shuts down
// instead of lingering as an orphan.
if (process.env.VELA_PARENT_WATCH === "1") {
  process.stdin.resume();
  process.stdin.on("end", shutdown);
  process.stdin.on("close", shutdown);
}

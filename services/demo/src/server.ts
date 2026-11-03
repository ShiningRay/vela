import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import { RemoteHub, createSource } from "@vela/remote/hub";
import { SurfaceRegistry } from "@vela/core";
import type { SurfaceRecord } from "@vela/core";
import { AgentState, SURFACES_KEY, AGENT_DATA_KEY, AGENT_NOTIFICATIONS_KEY, createAgentMcpServer, normalizeOwner } from "@vela/agent-mcp";
import type { AgentMcpServer } from "@vela/agent-mcp";
import type { PackageToolDeclaration } from "@vela/agent-mcp";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
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

// --- Agent appearance layer -------------------------------------------------

const surfaces = new SurfaceRegistry();
const agentState = new AgentState();
const hubs = new Set<RemoteHub>();

function watchAgentSources(hub: RemoteHub): void {
  hub.watch(SURFACES_KEY, surfaces.source);
  hub.watch(AGENT_DATA_KEY, agentState.agentData);
  hub.watch(AGENT_NOTIFICATIONS_KEY, agentState.notifications);
  for (const [key, source] of agentState.dataSources) hub.watch(key, source);
}

agentState.onNewSource((key) => {
  const source = agentState.dataSources.get(key);
  if (!source) return;
  for (const hub of hubs) hub.watch(key, source);
});

/** One shared batch id fans out to every connected hub so all sessions commit atomically. */
function batchAcrossHubs(fn: () => void, batchId?: string): void {
  const id = batchId ?? `dashboard-${Date.now()}`;
  for (const hub of hubs) hub.batch(fn, id);
}

const agentMcp = createAgentMcpServer({
  state: agentState,
  surfaces,
  getOwner: () => "agent.local",
  batch: batchAcrossHubs,
});

// --- MCP over Streamable HTTP ------------------------------------------------

interface McpSession {
  transport: StreamableHTTPServerTransport;
  server: AgentMcpServer;
}

const mcpSessions = new Map<string, McpSession>();
/** Package tool declarations every MCP session must carry. */
const packageRegistry = new Map<string, Parameters<AgentMcpServer["registerPackageTools"]>[0]>();

function registerPackagesInto(server: AgentMcpServer): void {
  for (const registration of packageRegistry.values()) {
    server.registerPackageTools(registration);
  }
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 2_000_000) {
        reject(new Error("request body too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

async function handleMcpRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const sessionId = request.headers["mcp-session-id"];
  if (typeof sessionId === "string" && mcpSessions.has(sessionId)) {
    const session = mcpSessions.get(sessionId)!;
    const body = request.method === "POST" ? JSON.parse(await readBody(request)) : undefined;
    await session.transport.handleRequest(request, response, body);
    return;
  }

  if (request.method === "POST") {
    let body: unknown;
    try {
      body = JSON.parse(await readBody(request));
    } catch {
      response.writeHead(400).end("invalid JSON");
      return;
    }
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id: string) => {
        mcpSessions.set(id, { transport, server: session });
      },
      onsessionclosed: (id: string) => {
        mcpSessions.delete(id);
      },
    });
    const session = createAgentMcpServer({
      state: agentState,
      surfaces,
      getOwner: () =>
        normalizeOwner(
          (session as unknown as { server?: { getClientVersion?: () => { name?: string } | undefined } }).server?.getClientVersion?.()?.name,
        ),
      batch: batchAcrossHubs,
    });
    await session.connect(transport);
    registerPackagesInto(session);
    await transport.handleRequest(request, response, body);
    return;
  }

  response.writeHead(400).end("missing MCP session");
}

// --- Skill document ----------------------------------------------------------
// Bundled in at build time (esbuild --loader:.md=text) so the service serves
// exactly the skill document shipped with this build.

import agentSkillDocument from "../../../packages/agent-mcp/AGENT_SKILL.md";

function readSkillDocument(): string {
  return agentSkillDocument;
}

// --- Package declarations (proposed by the desktop shell) --------------------

const PACKAGE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,31}$/;

interface PackageProposal {
  action: "register" | "unregister";
  id: string;
  tools?: PackageToolDeclaration[];
  surfaces?: Array<{
    id: string;
    kind: "window" | "widget" | "panel";
    title: string;
    geometry: SurfaceRecord["geometry"];
    content: SurfaceRecord["content"];
    dataKey?: string;
  }>;
}

function packageOwner(id: string): string {
  return `pkg.${id}`;
}

function handlePackageProposal(value: unknown): void {
  const proposal = value as PackageProposal;
  if (!proposal || (proposal.action !== "register" && proposal.action !== "unregister")) return;
  if (typeof proposal.id !== "string" || !PACKAGE_ID_PATTERN.test(proposal.id)) return;
  const owner = packageOwner(proposal.id);

  if (proposal.action === "unregister") {
    for (const record of surfaces.list(owner)) surfaces.destroy(record.id);
    packageRegistry.delete(proposal.id);
    for (const session of mcpSessions.values()) session.server.unregisterPackageTools(proposal.id);
    return;
  }

  // Link declared datasources to their http tools so an agent calling the
  // tool feeds the package's own charts without any package-side code.
  const datasources = new Map<string, string>();
  const declared = (proposal as { datasources?: Array<{ key?: string; tool?: string }> }).datasources ?? [];
  for (const entry of declared) {
    if (typeof entry?.key === "string" && typeof entry?.tool === "string") datasources.set(entry.tool, entry.key);
  }
  const tools = (proposal.tools ?? []).map((tool) => {
    const key = datasources.get(tool.name);
    return key && tool.type === "http" ? { ...tool, publishTo: key } : tool;
  });

  for (const surface of proposal.surfaces ?? []) {
    surfaces.upsert({
      id: `${proposal.id}.${surface.id}`,
      owner,
      kind: surface.kind,
      title: surface.title || `${proposal.id}.${surface.id}`,
      geometry: surface.geometry,
      content: surface.content,
      persist: true,
      createdAt: Date.now(),
    });
  }

  if (tools.length > 0) {
    const registration = { id: proposal.id, tools };
    packageRegistry.set(proposal.id, registration);
    for (const session of mcpSessions.values()) session.server.registerPackageTools(registration);
  }
}

// --- Demo sources ------------------------------------------------------------

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

  if (message.key === "agent.packages") {
    handlePackageProposal(message.value);
    return;
  }

  if (message.key === "service:ping") publishStatus();
}

const httpServer = createHttpServer((request, response) => {
  const url = request.url ?? "/";
  if (url.split("?")[0] === "/mcp") {
    void handleMcpRequest(request, response).catch(() => {
      if (!response.headersSent) response.writeHead(500).end("MCP failure");
    });
    return;
  }
  if (url.split("?")[0] === "/agent-skill") {
    response.writeHead(200, { "content-type": "text/markdown; charset=utf-8" });
    response.end(readSkillDocument());
    return;
  }
  if (url.split("?")[0] === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ state: "ready", connections, pid: process.pid }));
    return;
  }
  response.writeHead(404).end();
});

const server = new WebSocketServer({ server: httpServer });

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
  watchAgentSources(hub);
  hubs.add(hub);
  wire.onMessage(handleProposal);

  socket.on("close", () => {
    connections = Math.max(0, connections - 1);
    publishStatus();
    hubs.delete(hub);
    hub.dispose();
  });
  socket.on("error", () => {
    // Close follows; do not crash the service on a broken client.
  });
});

httpServer.listen(PORT, "127.0.0.1", () => {
  const address = httpServer.address();
  const port = typeof address === "object" && address ? address.port : PORT;
  console.log(`READY ${JSON.stringify({ port, url: `ws://127.0.0.1:${port}`, mcp: `http://127.0.0.1:${port}/mcp` })}`);
});

httpServer.on("error", (error) => {
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
  for (const session of mcpSessions.values()) {
    void session.transport.close();
  }
  mcpSessions.clear();
  server.close(() => process.exit(0));
  httpServer.close(() => process.exit(0));
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

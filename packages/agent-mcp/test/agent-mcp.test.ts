import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createServer, type Server } from "node:http";
import { SurfaceRegistry } from "@vela/core";
import { AgentState, dataKeyFor } from "../src/state";
import { createAgentMcpServer, executeHttpTool } from "../src/server";

async function makeClient(overrides: Partial<Parameters<typeof createAgentMcpServer>[0]> = {}) {
  const surfaces = (overrides.surfaces as SurfaceRegistry) ?? new SurfaceRegistry();
  const state = overrides.state ?? new AgentState();
  const batchCalls: Array<{ batchId?: string; operations: number }> = [];
  const server = createAgentMcpServer({
    state,
    surfaces,
    getOwner: () => "agent-a",
    ...(overrides.batch
      ? { batch: overrides.batch }
      : {
          batch: (fn: () => void, batchId?: string) => {
            batchCalls.push({ batchId, operations: 0 });
            fn();
          },
        }),
  });
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server, surfaces, state, batchCalls };
}

function payload(result: CallToolResult): Record<string, unknown> {
  const text = (result.content[0] as { text: string }).text;
  if (text.startsWith("MCP error")) return { error: "mcp_error", message: text };
  return JSON.parse(text) as Record<string, unknown>;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<CallToolResult> {
  return (await client.callTool({ name, arguments: args })) as CallToolResult;
}

describe("surface tools", () => {
  it("creates, lists, patches and removes surfaces for the caller's owner", async () => {
    const { client, surfaces } = await makeClient();

    const created = await call(client, "surface.create", {
      id: "w1",
      kind: "widget",
      title: "Revenue",
      x: 10,
      y: 20,
      width: 320,
      height: 200,
      content: { type: "static", title: "Revenue", body: "1.2M" },
    });
    expect(created.isError).toBeFalsy();
    expect(payload(created)).toMatchObject({ id: "w1", owner: "agent-a", kind: "widget" });
    expect(surfaces.get("w1")!.owner).toBe("agent-a");

    const listed = payload(await call(client, "surface.list"));
    expect(listed).toMatchObject({ owner: "agent-a" });
    expect(listed.surfaces).toHaveLength(1);

    const patched = payload(await call(client, "surface.patch", { id: "w1", x: 0, y: 0 }));
    expect(patched.geometry).toMatchObject({ x: 0, y: 0 });

    const removed = payload(await call(client, "surface.remove", { id: "w1" }));
    expect(removed).toMatchObject({ removed: true });
    expect(surfaces.has("w1")).toBe(false);
  });

  it("rejects duplicate ids, cross-owner access and non-whitelisted content", async () => {
    const { client, surfaces } = await makeClient();
    await call(client, "surface.create", {
      id: "w1",
      kind: "widget",
      geometry: { x: 0, y: 0, width: 100, height: 80 },
      content: { type: "static", title: "t", body: "b" },
    });

    const duplicate = await call(client, "surface.create", {
      id: "w1",
      kind: "widget",
      content: { type: "static", title: "t", body: "b" },
    });
    expect(duplicate.isError).toBe(true);
    expect(payload(duplicate).error).toBe("duplicate_id");
    expect(surfaces.get("w1")!.content).toEqual({ type: "static", title: "t", body: "b" });

    const html = await call(client, "surface.create", {
      id: "evil",
      kind: "widget",
      content: { type: "html", body: "<script>alert(1)</script>" },
    });
    expect(html.isError).toBe(true);
    expect(payload(html)).toMatchObject({
      error: "unsupported_content",
      available: ["static", "remote", "component", "chart"],
    });
    expect(surfaces.has("evil")).toBe(false);

    surfaces.create({
      id: "foreign",
      owner: "agent-b",
      kind: "widget",
      geometry: { x: 0, y: 0, width: 100, height: 80 },
      content: { type: "static", title: "t", body: "b" },
    });
    const forbidden = await call(client, "surface.patch", { id: "foreign", title: "Hijack" });
    expect(forbidden.isError).toBe(true);
    expect(payload(forbidden).error).toBe("forbidden");
    expect(surfaces.get("foreign")!.title).not.toBe("Hijack");

    const forbiddenRemove = await call(client, "surface.remove", { id: "foreign" });
    expect(payload(forbiddenRemove).error).toBe("forbidden");
    expect(surfaces.has("foreign")).toBe(true);
  });
});

describe("chart tools", () => {
  it("runs the agent flow: create chart, wait, push data, change kind", async () => {
    const { client, surfaces, state } = await makeClient();

    const created = payload(await call(client, "chart.create", {
      id: "trend",
      kind: "line",
      title: "Revenue",
      encoding: { x: "date", y: "revenue" },
      dataKey: "daily",
      x: 100,
      y: 100,
    }));
    expect(created).toMatchObject({ id: "trend", dataKey: "daily" });
    const record = surfaces.get("trend")!;
    expect(record.owner).toBe("agent-a");
    expect(record.content).toMatchObject({ type: "chart", dataKey: "daily" });

    // Data arrives under agent.<owner>.data.<key> and is visible to the desktop.
    const pushed = payload(await call(client, "chart.pushData", {
      dataKey: "daily",
      rows: [{ date: "2026-01-01", revenue: 12 }],
    }));
    expect(pushed).toMatchObject({ key: dataKeyFor("agent-a", "daily"), rows: 1 });
    expect(state.dataSources.get(dataKeyFor("agent-a", "daily"))!.get()).toEqual([
      { date: "2026-01-01", revenue: 12 },
    ]);

    // Changing the chart kind keeps the data flow intact.
    const patched = payload(await call(client, "chart.patch", {
      id: "trend",
      spec: { kind: "bar", encoding: { x: "date", y: "revenue" } },
    }));
    expect(patched).toMatchObject({ id: "trend", kind: "bar" });
    expect(state.dataSources.get(dataKeyFor("agent-a", "daily"))!.get()).toHaveLength(1);
  });

  it("rejects unknown fields, gauge without max and non-ISO times with structured errors", async () => {
    const { client } = await makeClient();

    // A spec may be created before its data arrives; unknown fields are
    // rejected when the rows show up (the agent can then patch in one step).
    await call(client, "chart.create", {
      id: "rev",
      kind: "line",
      encoding: { x: "date", y: "revnue" },
      dataKey: "rev",
    });
    const unknownField = await call(client, "chart.pushData", {
      dataKey: "rev",
      rows: [{ date: "2026-01-01", revenue: 12 }],
    });
    const unknownPayload = payload(unknownField);
    expect(unknownField.isError).toBe(true);
    expect(unknownPayload.error).toBe("unknown_field");
    expect(unknownPayload.path).toBe("encoding.y");
    expect(unknownPayload.available).toContain("revenue");

    const noMax = await call(client, "chart.create", {
      id: "g1",
      kind: "gauge",
      encoding: { value: "cpu" },
      dataKey: "cpu",
    });
    expect(noMax.isError).toBe(true);
    expect(payload(noMax)).toMatchObject({ error: "missing_max", path: "encoding.max" });

    const withMax = await call(client, "chart.create", {
      id: "g2",
      kind: "gauge",
      encoding: { value: "cpu", max: 100 },
      dataKey: "cpu2",
    });
    expect(withMax.isError).toBeFalsy();
    const badTime = await call(client, "chart.pushData", { dataKey: "cpu2", rows: [{ cpu: 1 }] });
    expect(badTime.isError).toBeFalsy();

    await call(client, "chart.create", {
      id: "t1",
      kind: "line",
      xType: "time",
      encoding: { x: "at", y: "revenue" },
      dataKey: "timeseries",
    });
    const invalidTime = await call(client, "chart.pushData", {
      dataKey: "timeseries",
      rows: [{ at: "2026/11/04", revenue: 1 }],
    });
    expect(invalidTime.isError).toBe(true);
    expect(payload(invalidTime)).toMatchObject({ error: "invalid_time", path: "rows[0].at" });
  });

  it("enforces the 5000-row limit", async () => {
    const { client } = await makeClient();
    await call(client, "chart.create", { id: "k", kind: "kpi", encoding: { value: "v" }, dataKey: "big" });
    const rows = Array.from({ length: 5001 }, (_, index) => ({ v: index }));
    const result = await call(client, "chart.pushData", { dataKey: "big", rows });
    expect(result.isError).toBe(true);
    expect(payload(result).error).toBe("too_many_rows");
  });
});

describe("dashboard.apply", () => {
  it("groups every operation into one batch id", async () => {
    const batchCalls: Array<{ batchId?: string }> = [];
    const { client, surfaces } = await makeClient({
      batch: (fn: () => void, batchId?: string) => {
        batchCalls.push({ batchId });
        fn();
      },
    });

    const result = await call(client, "dashboard.apply", {
      batchId: "frame-1",
      operations: [
        {
          tool: "chart.create",
          arguments: { id: "a", kind: "kpi", encoding: { value: "v" }, dataKey: "d" },
        },
        {
          tool: "chart.pushData",
          arguments: { dataKey: "d", rows: [{ v: 1 }] },
        },
        {
          tool: "surface.remove",
          arguments: { id: "a" },
        },
      ],
    });
    expect(result.isError).toBeFalsy();
    const body = payload(result) as { batchId: string; results: Array<Record<string, unknown>> };
    expect(body.batchId).toBe("frame-1");
    expect(body.results).toHaveLength(3);
    expect(batchCalls).toEqual([{ batchId: "frame-1" }]);
    expect(surfaces.has("a")).toBe(false);
  });

  it("flags the whole frame when one operation fails but still applies the rest", async () => {
    const { client, surfaces } = await makeClient();
    const result = await call(client, "dashboard.apply", {
      operations: [
        { tool: "chart.create", arguments: { id: "ok", kind: "kpi", encoding: { value: "v" } } },
        { tool: "surface.remove", arguments: { id: "missing" } },
      ],
    });
    expect(result.isError).toBe(true);
    expect(surfaces.has("ok")).toBe(true);
  });
});

describe("signal, notify and vfs tools", () => {
  it("namespaces published signals under the owner", async () => {
    const { client, state } = await makeClient();
    const result = payload(await call(client, "signal.publish", { key: "data.daily", value: [{ v: 1 }] }));
    expect(result).toMatchObject({ key: "agent-a.data.daily" });
    expect(state.dataSources.get("agent-a.data.daily")!.get()).toEqual([{ v: 1 }]);

    const hijack = await call(client, "signal.publish", { key: "agent.surfaces", value: [] });
    expect(hijack.isError).toBe(true);
    expect(payload(hijack).error).toBe("forbidden");
  });

  it("pushes notifications into the desktop feed", async () => {
    const { client, state } = await makeClient();
    const result = payload(await call(client, "notify.push", { title: "Deploy done", body: "v1.2 online" }));
    expect(result.id).toBe(1);
    expect(state.notifications.get()).toHaveLength(1);
    expect(state.notifications.get()[0]).toMatchObject({ owner: "agent-a", title: "Deploy done" });
  });

  it("restricts vfs tools to /AgentData/<owner>/**", async () => {
    const { client, state } = await makeClient();
    const written = payload(await call(client, "vfs.write", { path: "/AgentData/agent-a/notes.md", content: "hello" }));
    expect(written).toMatchObject({ path: "/AgentData/agent-a/notes.md", bytes: 5 });
    expect(state.readAgentFile("agent-a", "notes.md")).toBe("hello");

    const read = payload(await call(client, "vfs.read", { path: "/AgentData/agent-a/notes.md" }));
    expect(read.content).toBe("hello");

    for (const path of ["/Surfaces/x.json", "/AgentData/agent-b/notes.md", "/AgentData/agent-a/../agent-b/x"]) {
      const denied = await call(client, "vfs.write", { path, content: "nope" });
      expect(denied.isError).toBe(true);
      expect(payload(denied).error).toBe("forbidden");
    }
    expect(state.agentData.get()["agent-b"]).toBeUndefined();
  });
});

describe("package-declared tools", () => {
  let httpServer: Server;
  let baseUrl = "";

  afterEach(async () => {
    if (httpServer) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      httpServer = undefined as unknown as Server;
    }
  });

  function startHttpServer(handler: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => void): Promise<string> {
    return new Promise((resolve) => {
      httpServer = createServer(handler);
      httpServer.listen(0, "127.0.0.1", () => {
        const address = httpServer.address();
        resolve(`http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`);
      });
    });
  }

  it("registers, calls and unregisters static and http tools with the package prefix", async () => {
    const { client, server } = await makeClient();

    const registered = payload(await server.registerPackageTools({
      id: "sales-board",
      tools: [
        { name: "seed", type: "static", path: "data/seed.json", content: "{\"rows\":[1,2]}" },
        {
          name: "query",
          type: "http",
          endpoint: "http://example.invalid/daily",
          method: "GET",
          params: { from: "string" },
          required: ["from"],
          netHosts: ["example.invalid"],
        },
      ],
    }));
    expect(registered.tools).toEqual(["sales-board.seed", "sales-board.query"]);

    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name);
    expect(names).toContain("sales-board.seed");
    expect(names).toContain("sales-board.query");

    const seed = payload(await call(client, "sales-board.seed"));
    expect(seed.content).toBe('{"rows":[1,2]}');

    const missing = await call(client, "sales-board.query", { params: {} });
    expect(missing.isError).toBe(true);
    expect(payload(missing).error).toBe("invalid_params");

    server.unregisterPackageTools("sales-board");
    const after = (await client.listTools()).tools.map((tool) => tool.name);
    expect(after).not.toContain("sales-board.seed");
    const gone = await call(client, "sales-board.seed");
    expect(gone.isError).toBe(true);
  });

  it("rejects code-bearing tool declarations with unsupported_tool", async () => {
    const { server } = await makeClient();
    const result = await server.registerPackageTools({
      id: "evil",
      tools: [{ name: "run", type: "code" } as never],
    });
    expect(result.isError).toBe(true);
    expect(payload(result).error).toBe("unsupported_tool");
  });

  it("blocks static tools that escape the package directory", async () => {
    const { server } = await makeClient();
    for (const path of ["../secret.json", "/etc/passwd", "a/../../b.json"]) {
      const result = await server.registerPackageTools({
        id: "p",
        tools: [{ name: "leak", type: "static", path, content: "x" }],
      });
      expect(result.isError).toBe(true);
      expect(payload(result).error).toBe("forbidden");
    }
  });

  it("executes an http tool against a granted localhost source", async () => {
    const url = await startHttpServer((req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ rows: [{ date: "2026-01-01", revenue: 7 }] }));
    });
    const { client, server } = await makeClient();
    await server.registerPackageTools({
      id: "sales-board",
      tools: [{
        name: "daily",
        type: "http",
        endpoint: `${url}/daily`,
        method: "GET",
        params: { from: "string" },
        netHosts: ["127.0.0.1"],
      }],
    });
    const result = await call(client, "sales-board.daily", { params: { from: "2026-01-01" } });
    expect(result.isError).toBeFalsy();
    expect(payload(result).data).toEqual({ rows: [{ date: "2026-01-01", revenue: 7 }] });
  });

  it("blocks SSRF targets that resolve to private ranges without an explicit grant", async () => {
    const result = await executeHttpTool(
      { name: "meta", type: "http", endpoint: "http://169.254.169.254/latest/meta-data", netHosts: ["api.example.com"] },
      {},
      { lookup: async () => ["169.254.169.254"] },
    );
    expect(result).toMatchObject({ ok: false, code: "forbidden_target" });
  });

  it("allows private targets only when the exact host is granted", async () => {
    const url = await startHttpServer((req, res) => {
      res.end("ok");
    });
    const result = await executeHttpTool(
      { name: "local", type: "http", endpoint: `${url}/`, netHosts: ["127.0.0.1"] },
      {},
      { lookup: async () => ["127.0.0.1"] },
    );
    expect(result).toMatchObject({ ok: true, data: "ok" });
  });

  it("rejects hosts outside the net: permission", async () => {
    const result = await executeHttpTool(
      { name: "x", type: "http", endpoint: "https://evil.example.com/steal", netHosts: ["api.example.com"] },
      {},
      { lookup: async () => ["93.184.216.34"] },
    );
    expect(result).toMatchObject({ ok: false, code: "forbidden_target" });
  });

  it("rejects oversized responses before reading the body", async () => {
    const url = await startHttpServer((req, res) => {
      res.setHeader("content-length", String(2_000_000));
      res.end("x");
    });
    const result = await executeHttpTool(
      { name: "big", type: "http", endpoint: `${url}/big`, netHosts: ["127.0.0.1"] },
      {},
      { lookup: async () => ["127.0.0.1"] },
    );
    expect(result).toMatchObject({ ok: false, code: "response_too_large" });
  });

  it("maps request timeouts to a timeout error", async () => {
    const pending = executeHttpTool(
      { name: "slow", type: "http", endpoint: "http://127.0.0.1:9/slow", netHosts: ["127.0.0.1"] },
      {},
      {
        lookup: async () => ["127.0.0.1"],
        fetchImpl: ((_url: unknown, init?: { signal?: AbortSignal }) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              const error = new Error("This operation was aborted");
              error.name = "TimeoutError";
              reject(error);
            });
          })) as unknown as typeof fetch,
        timeoutMs: 50,
      },
    );
    await expect(pending).resolves.toMatchObject({ ok: false, code: "timeout" });
  });
});

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  MAX_CHART_ROWS,
  SurfaceError,
  SurfaceRegistry,
  validateChartSpec,
  type ChartRow,
  type ChartSpec,
  type ChartSpecError,
} from "@vela/core";
import { AgentState, dataKeyFor } from "./state";

export const DEFAULT_OWNER = "agent.local";
export const OWNER_PATTERN = /^[a-z0-9][a-z0-9._-]{0,62}$/;
export const AGENT_DATA_PREFIX = "/AgentData/";
export const HTTP_TOOL_MAX_BYTES = 1_000_000;
export const HTTP_TOOL_TIMEOUT_MS = 10_000;
export const STATIC_TOOL_MAX_BYTES = 256_000;

export interface PackageToolDeclaration {
  name: string;
  type: "http" | "static";
  description?: string;
  /** http: absolute endpoint URL. */
  endpoint?: string;
  /** http: request method; defaults to GET. */
  method?: "GET" | "POST";
  /** http: parameter schema subset (inline). */
  params?: Record<string, "string" | "number" | "boolean">;
  required?: string[];
  /** http: granted net sources, e.g. ["api.example.com"]. */
  netHosts?: string[];
  /** http: publish successful array responses to this package datasource key. */
  publishTo?: string;
  /** static: package-relative file path. */
  path?: string;
  /** static: the file content captured at registration time. */
  content?: string;
}

export interface AgentMcpOptions {
  state: AgentState;
  surfaces: SurfaceRegistry;
  /** Resolves the calling agent's owner identity for the current session. */
  getOwner: () => string;
  /** Groups mutations into one atomic remote frame; used by dashboard.apply. */
  batch?: (fn: () => void, batchId?: string) => void;
  /** DNS lookup injection for tests; defaults to node:dns lookup. */
  lookup?: (hostname: string) => Promise<string[]>;
}

export interface PackageToolRegistration {
  id: string;
  tools: PackageToolDeclaration[];
}

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function ok(value: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value ?? { ok: true }) }] };
}

function fail(code: string, message: string, extra: Record<string, unknown> = {}): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: code, message, ...extra }) }],
    isError: true,
  };
}

function surfaceFailure(error: unknown): ToolResult {
  if (error instanceof SurfaceError) {
    return fail(error.code, error.message, {
      ...(error.path ? { path: error.path } : {}),
      ...(error.available ? { available: error.available } : {}),
    });
  }
  return fail("invalid_surface", error instanceof Error ? error.message : String(error));
}

export function normalizeOwner(value: string | undefined | null): string {
  const candidate = (value ?? "").toLowerCase().replace(/[^a-z0-9._-]/g, "-").slice(0, 63);
  return OWNER_PATTERN.test(candidate) ? candidate : DEFAULT_OWNER;
}

/** Owner-scoped whitelist from the agent-mcp spec: `/AgentData/<owner>/**`. */
export function agentDataPathError(owner: string, path: string): string | null {
  if (typeof path !== "string" || !path.startsWith(AGENT_DATA_PREFIX)) {
    return `forbidden: vfs tools only access ${AGENT_DATA_PREFIX}<owner>/**`;
  }
  const rest = path.slice(AGENT_DATA_PREFIX.length);
  if (!rest || rest.split("/")[0] !== owner) return "forbidden: path escapes the caller's owner namespace";
  if (path.split("/").some((segment) => segment === "..")) return "forbidden: path traversal is not allowed";
  return null;
}

function isPrivateIp(ip: string): boolean {
  if (ip === "::1" || ip === "0.0.0.0") return true;
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }
  const lower = ip.toLowerCase();
  return lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80");
}

async function defaultLookup(hostname: string): Promise<string[]> {
  const { lookup } = await import("node:dns/promises");
  const addresses = await lookup(hostname, { all: true });
  return addresses.map((address) => address.address);
}

function validateHttpParams(
  decl: PackageToolDeclaration,
  params: Record<string, unknown> | undefined,
): string | null {
  const schema = decl.params ?? {};
  const required = new Set(decl.required ?? []);
  const values = params ?? {};
  for (const key of required) {
    if (!(key in values)) return `missing required parameter "${key}"`;
  }
  for (const [key, value] of Object.entries(values)) {
    const expected = schema[key];
    if (!expected) return `unknown parameter "${key}"`;
    if (expected === "string" && typeof value !== "string") return `parameter "${key}" must be a string`;
    if (expected === "number" && typeof value !== "number") return `parameter "${key}" must be a number`;
    if (expected === "boolean" && typeof value !== "boolean") return `parameter "${key}" must be a boolean`;
  }
  return null;
}

export interface HttpExecuteContext {
  fetchImpl?: typeof fetch;
  lookup?: (hostname: string) => Promise<string[]>;
  timeoutMs?: number;
}

/** Host-executed http tool: SSRF guard, timeout and response size cap. */
export async function executeHttpTool(
  decl: PackageToolDeclaration,
  params: Record<string, unknown> | undefined,
  context: HttpExecuteContext = {},
): Promise<{ ok: true; data: unknown; bytes: number } | { ok: false; code: string; message: string }> {
  const paramError = validateHttpParams(decl, params);
  if (paramError) return { ok: false, code: "invalid_params", message: paramError };

  let endpoint: URL;
  try {
    endpoint = new URL(decl.endpoint ?? "");
  } catch {
    return { ok: false, code: "invalid_params", message: "tool endpoint is not a valid URL" };
  }
  if (endpoint.protocol !== "https:" && endpoint.protocol !== "http:") {
    return { ok: false, code: "invalid_params", message: "tool endpoint must be http(s)" };
  }

  const host = endpoint.hostname;
  const netHosts = decl.netHosts ?? [];
  const hostAllowed = netHosts.some((allowed) => allowed === host || host.endsWith(`.${allowed}`));
  if (!hostAllowed) {
    return {
      ok: false,
      code: "forbidden_target",
      message: `endpoint host "${host}" is not covered by the package's net: permissions`,
    };
  }

  const lookup = context.lookup ?? defaultLookup;
  let addresses: string[] = [];
  try {
    addresses = await lookup(host);
  } catch (error) {
    return {
      ok: false,
      code: "target_unreachable",
      message: `cannot resolve endpoint host: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  // Loopback, link-local and private ranges stay blocked unless the exact
  // host was explicitly granted (the net: permission is the explicit opt-in).
  if (addresses.some((ip) => isPrivateIp(ip)) && !netHosts.includes(host)) {
    return {
      ok: false,
      code: "forbidden_target",
      message: `endpoint resolves to a private address (${addresses.join(", ")}) and is not explicitly granted`,
    };
  }

  const method = decl.method ?? "GET";
  const url = new URL(endpoint.toString());
  let body: string | undefined;
  if (method === "GET") {
    for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, String(value));
  } else {
    body = JSON.stringify(params ?? {});
  }

  const fetchImpl = context.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(url, {
      method,
      ...(body !== undefined ? { body, headers: { "content-type": "application/json" } } : {}),
      signal: AbortSignal.timeout(context.timeoutMs ?? HTTP_TOOL_TIMEOUT_MS),
    });
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > HTTP_TOOL_MAX_BYTES) {
      return { ok: false, code: "response_too_large", message: `response exceeds ${HTTP_TOOL_MAX_BYTES} bytes` };
    }
    const text = await response.text();
    if (text.length > HTTP_TOOL_MAX_BYTES) {
      return { ok: false, code: "response_too_large", message: `response exceeds ${HTTP_TOOL_MAX_BYTES} bytes` };
    }
    if (!response.ok) {
      return { ok: false, code: "upstream_error", message: `endpoint returned ${response.status}` };
    }
    const contentType = response.headers.get("content-type") ?? "";
    const data = contentType.includes("json") ? (JSON.parse(text) as unknown) : text;
    return { ok: true, data, bytes: text.length };
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return { ok: false, code: "timeout", message: `endpoint did not respond within ${context.timeoutMs ?? HTTP_TOOL_TIMEOUT_MS}ms` };
    }
    return {
      ok: false,
      code: "request_failed",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export function staticToolError(decl: PackageToolDeclaration): string | null {
  if (decl.type !== "static") return "not a static tool";
  const path = decl.path ?? "";
  if (!path || path.startsWith("/") || path.split("/").some((segment) => segment === ".." || segment === "")) {
    return "forbidden: static tool paths must stay inside the package";
  }
  if ((decl.content ?? "").length > STATIC_TOOL_MAX_BYTES) {
    return "response_too_large: static resource exceeds the registration limit";
  }
  return null;
}

/** Zod shape shared by every surface-creating tool. */
const contentShape = {
  // `type` is validated by SurfaceRegistry so the agent receives a
  // structured unsupported_content error instead of a protocol-level one.
  type: z.string(),
  title: z.string().optional(),
  body: z.string().optional(),
  sourceKey: z.string().optional(),
  appId: z.string().optional(),
  props: z.unknown().optional(),
  spec: z.unknown().optional(),
  dataKey: z.string().optional(),
};

const geometryShape = {
  x: z.number().default(40),
  y: z.number().default(40),
  width: z.number().default(360),
  height: z.number().default(240),
};

function specFromArgs(args: {
  kind: string;
  encoding?: Record<string, unknown>;
  xType?: string;
  decimals?: number;
  yUnit?: string;
  title?: string;
}): ChartSpec {
  const spec: Record<string, unknown> = {
    kind: args.kind,
    encoding: args.encoding ?? {},
  };
  if (args.title !== undefined) spec.title = args.title;
  if (args.xType !== undefined) spec.xType = args.xType;
  if (args.decimals !== undefined) spec.decimals = args.decimals;
  if (args.yUnit !== undefined) spec.yUnit = args.yUnit;
  return spec as unknown as ChartSpec;
}

export interface AgentMcpServer extends McpServer {
  dispatch: (tool: string, args: Record<string, unknown>, owner: string) => ToolResult;
  registerPackageTools: (pkg: PackageToolRegistration) => ToolResult;
  unregisterPackageTools: (pkgId: string) => void;
  packageToolNames: () => string[];
}

/**
 * Builds the MCP server with the full appearance tool set. The same instance
 * also hosts package-declared tools registered at runtime via
 * `registerPackageTools` and removed with `unregisterPackageTools`.
 */
export function createAgentMcpServer(options: AgentMcpOptions): AgentMcpServer {
  const { state, surfaces } = options;
  const batch = options.batch ?? ((fn: () => void) => fn());

  const server = new McpServer(
    { name: "vela-agent-mcp", version: "0.1.0" },
    { capabilities: { tools: { listChanged: true } } },
  );

  const dispatch = (tool: string, args: Record<string, unknown>, owner: string): ToolResult => {
    switch (tool) {
      case "surface.create": {
        try {
          const record = surfaces.create({
            id: args.id as string,
            owner,
            kind: args.kind as "window" | "widget" | "panel",
            title: args.title as string | undefined,
            geometry: {
              x: (args.x as number) ?? 40,
              y: (args.y as number) ?? 40,
              width: (args.width as number) ?? 360,
              height: (args.height as number) ?? 240,
            },
            content: args.content as never,
            persist: (args.persist as boolean) ?? false,
            ttlSeconds: args.ttlSeconds as number | undefined,
          });
          return ok({ id: record.id, owner: record.owner, kind: record.kind });
        } catch (error) {
          return surfaceFailure(error);
        }
      }

      case "surface.patch": {
        const patch: Record<string, unknown> = {};
        if (args.title !== undefined) patch.title = args.title;
        if (args.x !== undefined || args.y !== undefined || args.width !== undefined || args.height !== undefined) {
          const current = surfaces.get(args.id as string);
          if (!current) return fail("unknown_surface", `Surface "${String(args.id)}" does not exist.`);
          const geometry = { ...current.geometry };
          if (args.x !== undefined) geometry.x = args.x as number;
          if (args.y !== undefined) geometry.y = args.y as number;
          if (args.width !== undefined) geometry.width = args.width as number;
          if (args.height !== undefined) geometry.height = args.height as number;
          patch.geometry = geometry;
        }
        if (args.content !== undefined) patch.content = args.content as never;
        if (args.ttlSeconds !== undefined) patch.ttlSeconds = args.ttlSeconds;
        try {
          const record = surfaces.patch(args.id as string, owner, patch);
          return ok({ id: record.id, title: record.title, geometry: record.geometry });
        } catch (error) {
          return surfaceFailure(error);
        }
      }

      case "surface.remove": {
        try {
          surfaces.remove(args.id as string, owner);
          return ok({ id: args.id, removed: true });
        } catch (error) {
          return surfaceFailure(error);
        }
      }

      case "surface.list": {
        return ok({ owner, surfaces: surfaces.list(owner) });
      }

      case "chart.create": {
        const spec = specFromArgs(args as never);
        const validation = validateChartSpec(spec);
        if (!validation.ok) return specErrors(validation.errors);
        const id = (args.id as string) ?? `chart-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
        try {
          surfaces.create({
            id,
            owner,
            kind: (args.surfaceKind as "window" | "widget" | "panel") ?? "widget",
            title: (args.title as string) ?? id,
            geometry: {
              x: (args.x as number) ?? 40,
              y: (args.y as number) ?? 40,
              width: (args.width as number) ?? 360,
              height: (args.height as number) ?? 240,
            },
            content: {
              type: "chart",
              spec,
              ...(args.dataKey !== undefined ? { dataKey: args.dataKey as string } : {}),
            },
            persist: (args.persist as boolean) ?? false,
            ttlSeconds: args.ttlSeconds as number | undefined,
          });
          return ok({ id, dataKey: args.dataKey ?? "data" });
        } catch (error) {
          return surfaceFailure(error);
        }
      }

      case "chart.patch": {
        const spec = (args.spec ?? undefined) as ChartSpec | undefined;
        if (!spec) return fail("invalid_spec", "chart.patch requires a spec.");
        const validation = validateChartSpec(spec);
        if (!validation.ok) return specErrors(validation.errors);
        try {
          const current = surfaces.get(args.id as string);
          if (!current) return fail("unknown_surface", `Surface "${String(args.id)}" does not exist.`);
          const content = current.content;
          if (content.type !== "chart") {
            return fail("invalid_spec", `Surface "${String(args.id)}" does not hold a chart.`);
          }
          const nextContent = {
            ...content,
            spec,
            ...(args.dataKey !== undefined ? { dataKey: args.dataKey as string } : {}),
          };
          surfaces.patch(args.id as string, owner, { content: nextContent });
          return ok({ id: args.id, kind: spec.kind });
        } catch (error) {
          return surfaceFailure(error);
        }
      }

      case "chart.pushData": {
        const dataKey = args.dataKey as string;
        const rows = args.rows as ChartRow[];
        if (typeof dataKey !== "string" || !dataKey) {
          return fail("invalid_params", "dataKey is required.");
        }
        if (!Array.isArray(rows)) return fail("invalid_params", "rows must be an array of objects.");
        if (rows.some((row) => typeof row !== "object" || row === null || Array.isArray(row))) {
          return fail("invalid_params", "rows must be an array of objects.");
        }
        if (rows.length > MAX_CHART_ROWS) {
          return fail("too_many_rows", `Data has ${rows.length} rows; the limit is ${MAX_CHART_ROWS}. Aggregate or downsample on the data side.`);
        }
        // Data is validated against every chart of this owner that binds the
        // key, so a bad field name is rejected instead of rendered.
        const consumers = surfaces.list(owner).filter((record) => {
          const content = record.content;
          return content.type === "chart" && (content.dataKey ?? "data") === dataKey;
        });
        const errors: ChartSpecError[] = [];
        for (const record of consumers) {
          const content = record.content;
          if (content.type !== "chart") continue;
          const validation = validateChartSpec(content.spec, rows);
          if (!validation.ok) errors.push(...validation.errors);
        }
        if (errors.length > 0) return specErrors(errors);
        state.publishRows(owner, dataKey, rows);
        return ok({ key: dataKeyFor(owner, dataKey), rows: rows.length });
      }

      case "signal.publish": {
        const key = args.key as string;
        if (typeof key !== "string" || !key) return fail("invalid_params", "key is required.");
        if (key.startsWith("agent.") || key.startsWith("pkg.")) {
          return fail("forbidden", "signal keys are namespaced under the caller's owner automatically.");
        }
        const fullKey = `${owner}.${key}`;
        state.publish(fullKey, args.value);
        return ok({ key: fullKey });
      }

      case "notify.push": {
        const event = state.pushNotification(owner, args.title as string, args.body as string | undefined);
        return ok({ id: event.id });
      }

      case "vfs.read": {
        const path = args.path as string;
        const pathError = agentDataPathError(owner, path);
        if (pathError) return fail("forbidden", pathError);
        const content = state.readAgentFile(owner, path.slice(AGENT_DATA_PREFIX.length + owner.length + 1));
        if (content === undefined) return fail("unknown_path", `No such file: ${path}`);
        return ok({ path, content });
      }

      case "vfs.write": {
        const path = args.path as string;
        const content = args.content as string;
        const pathError = agentDataPathError(owner, path);
        if (pathError) return fail("forbidden", pathError);
        if (typeof content !== "string") return fail("invalid_params", "content must be a string.");
        state.writeAgentFile(owner, path.slice(AGENT_DATA_PREFIX.length + owner.length + 1), content);
        return ok({ path, bytes: content.length });
      }

      default:
        return fail("unknown_tool", `Unknown tool: ${tool}`);
    }
  };

  const register = (name: string, description: string, shape: Record<string, z.ZodTypeAny>, run: (args: Record<string, unknown>, owner: string) => ToolResult): void => {
    server.registerTool(
      name,
      { description, inputSchema: shape },
      async (args: Record<string, unknown>) => run(args ?? {}, options.getOwner()),
    );
  };

  register("surface.create", "Create a desktop surface (window, widget or panel) owned by the caller.", {
    id: z.string(),
    kind: z.enum(["window", "widget", "panel"]),
    title: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    content: z.object(contentShape).strict(),
    persist: z.boolean().optional(),
    ttlSeconds: z.number().optional(),
  }, (args, owner) => dispatch("surface.create", args, owner));

  register("surface.patch", "Patch geometry, title, content or TTL of one of your surfaces.", {
    id: z.string(),
    title: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    content: z.object(contentShape).strict().optional(),
    ttlSeconds: z.number().nullable().optional(),
  }, (args, owner) => dispatch("surface.patch", args, owner));

  register("surface.remove", "Remove one of your surfaces.", {
    id: z.string(),
  }, (args, owner) => dispatch("surface.remove", args, owner));

  register("surface.list", "List the surfaces you own.", {}, (args, owner) => dispatch("surface.list", args, owner));

  register("chart.create", "Create a chart surface from a ChartSpec; data arrives via chart.pushData.", {
    id: z.string().optional(),
    title: z.string().optional(),
    kind: z.enum(["line", "bar", "pie", "gauge", "kpi", "table", "scatter"]),
    encoding: z.record(z.string(), z.unknown()),
    xType: z.enum(["category", "time", "value"]).optional(),
    decimals: z.number().optional(),
    yUnit: z.string().optional(),
    dataKey: z.string().optional(),
    surfaceKind: z.enum(["window", "widget", "panel"]).optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    persist: z.boolean().optional(),
    ttlSeconds: z.number().optional(),
  }, (args, owner) => dispatch("chart.create", args, owner));

  register("chart.patch", "Replace the ChartSpec (e.g. change chart kind) without touching the data flow.", {
    id: z.string(),
    spec: z.unknown(),
    dataKey: z.string().optional(),
  }, (args, owner) => dispatch("chart.patch", args, owner));

  register("chart.pushData", "Publish rows for a dataKey bound by your chart surfaces.", {
    dataKey: z.string(),
    rows: z.array(z.record(z.string(), z.unknown())),
  }, (args, owner) => dispatch("chart.pushData", args, owner));

  register("dashboard.apply", "Apply a list of surface operations as one atomic frame via a barrier.", {
    batchId: z.string().optional(),
    operations: z.array(z.object({
      tool: z.enum(["surface.create", "surface.patch", "surface.remove", "chart.create", "chart.patch", "chart.pushData", "signal.publish", "notify.push"]),
      arguments: z.record(z.string(), z.unknown()),
    })),
  }, (args, owner) => {
    const operations = (args.operations as Array<{ tool: string; arguments: Record<string, unknown> }>) ?? [];
    const batchId = (args.batchId as string) ?? `dashboard-${Date.now()}`;
    const results: Array<{ tool: string; result: unknown; isError?: boolean }> = [];
    batch(() => {
      for (const operation of operations) {
        const result = dispatch(operation.tool, operation.arguments ?? {}, owner);
        results.push({ tool: operation.tool, result: JSON.parse(result.content[0]!.text) as unknown, isError: result.isError });
      }
    }, batchId);
    const hasErrors = results.some((entry) => entry.isError);
    return {
      content: [{ type: "text", text: JSON.stringify({ batchId, results }) }],
      isError: hasErrors,
    };
  });

  register("signal.publish", "Publish a value under your owner namespace (agent.<owner>.<key>).", {
    key: z.string(),
    value: z.unknown(),
  }, (args, owner) => dispatch("signal.publish", args, owner));

  register("notify.push", "Push a desktop notification.", {
    title: z.string(),
    body: z.string().optional(),
  }, (args, owner) => dispatch("notify.push", args, owner));

  register("vfs.read", "Read a file from /AgentData/<your-owner>/**.", {
    path: z.string(),
  }, (args, owner) => dispatch("vfs.read", args, owner));

  register("vfs.write", "Write a file under /AgentData/<your-owner>/**.", {
    path: z.string(),
    content: z.string(),
  }, (args, owner) => dispatch("vfs.write", args, owner));

  // --- Package-declared tools ------------------------------------------------
  const packageTools = new Map<string, RegisteredTool[]>();

  const registerPackageTools = (pkg: PackageToolRegistration): ToolResult => {
    unregisterPackageTools(pkg.id);
    const registered: RegisteredTool[] = [];
    for (const decl of pkg.tools) {
      const name = `${pkg.id}.${decl.name}`;
      if (decl.type === "static") {
        const staticError = staticToolError(decl);
        if (staticError) return fail("forbidden", staticError);
        registered.push(
          server.registerTool(name, {
            description: decl.description ?? `Static resource ${decl.path} from package ${pkg.id}`,
            inputSchema: {},
          }, async () => {
            const validation = staticToolError(decl);
            if (validation) return fail("forbidden", validation);
            return ok({ path: decl.path, content: decl.content ?? "" });
          }),
        );
        continue;
      }

      if (decl.type !== "http") {
        return fail("unsupported_tool", `Tool "${decl.name}" must be http or static; code entries are not supported.`);
      }
      if (!decl.endpoint) {
        return fail("unsupported_tool", `http tool "${decl.name}" requires an endpoint.`);
      }
      registered.push(
        server.registerTool(name, {
          description: decl.description ?? `${decl.method ?? "GET"} ${decl.endpoint}`,
          inputSchema: { params: z.record(z.string(), z.unknown()).optional() },
        }, async (args: { params?: Record<string, unknown> }) => {
          const result = await executeHttpTool(decl, args?.params);
          if (!result.ok) return fail(result.code, result.message);
          if (decl.publishTo && Array.isArray(result.data)) {
            state.publishRows(`pkg.${pkg.id}`, decl.publishTo, result.data as ChartRow[]);
          }
          return ok({ data: result.data });
        }),
      );
    }
    packageTools.set(pkg.id, registered);
    return ok({ id: pkg.id, tools: pkg.tools.map((decl) => `${pkg.id}.${decl.name}`) });
  };

  const unregisterPackageTools = (pkgId: string): void => {
    for (const tool of packageTools.get(pkgId) ?? []) tool.remove();
    packageTools.delete(pkgId);
  };

  return Object.assign(server, {
    dispatch,
    registerPackageTools,
    unregisterPackageTools,
    packageToolNames: (): string[] => [...packageTools.keys()],
  }) as AgentMcpServer;
}

function specErrors(errors: ChartSpecError[]): ToolResult {
  const first = errors[0]!;
  return fail(first.code, first.message, {
    path: first.path,
    ...(first.available ? { available: first.available } : {}),
    errors,
  });
}

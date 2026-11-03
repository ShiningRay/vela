import type { ChartSpec, SurfaceRegistry, SurfaceContent, Vfs } from "@vela/core";
import type { RemoteSession } from "@vela/remote";
import type { VpkPackage } from "./packages";
import { serviceSession } from "./services";

/** Well-known propose key the shell uses to sync package declarations to the service. */
export const PACKAGES_PROPOSAL_KEY = "agent.packages";

export interface VpkAgentSurfaceDecl {
  id: string;
  kind: "window" | "widget" | "panel";
  title?: string;
  geometry: { x: number; y: number; width: number; height: number };
  content: SurfaceContent;
}

export interface VpkAgentChartDecl {
  id: string;
  title?: string;
  spec: ChartSpec;
  dataKey?: string;
  geometry?: { x: number; y: number; width: number; height: number };
}

export interface VpkAgentDatasourceDecl {
  key: string;
  tool: string;
}

export interface VpkAgentToolDecl {
  name: string;
  type: "http" | "static";
  description?: string;
  endpoint?: string;
  method?: "GET" | "POST";
  params?: Record<string, "string" | "number" | "boolean">;
  required?: string[];
  path?: string;
}

export interface VpkAgentSection {
  surfaces: VpkAgentSurfaceDecl[];
  charts: VpkAgentChartDecl[];
  datasources: VpkAgentDatasourceDecl[];
  tools: VpkAgentToolDecl[];
}

export interface VpkGrants {
  id: string;
  permissions: string[];
  grantedAt: number;
}

const DECL_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,47}$/;
const TOOL_FIELDS = new Set(["name", "type", "description", "endpoint", "method", "params", "required", "path"]);
const CODE_ENTRY_FIELDS = ["script", "module", "code", "entry", "handler", "source"];
const SURFACE_KINDS = new Set(["window", "widget", "panel"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseGeometryDecl(value: unknown, path: string): { x: number; y: number; width: number; height: number } {
  if (!isPlainObject(value)) throw new Error(`${path} must be an object`);
  const { x, y, width, height } = value;
  if (![x, y, width, height].every((entry) => typeof entry === "number" && Number.isFinite(entry))) {
    throw new Error(`${path} requires finite x, y, width and height`);
  }
  if ((width as number) <= 0 || (height as number) <= 0) {
    throw new Error(`${path} requires positive width and height`);
  }
  return { x, y, width, height } as { x: number; y: number; width: number; height: number };
}

function parseContentDecl(value: unknown, path: string, dataKeys: Set<string>): SurfaceContent {
  if (!isPlainObject(value)) throw new Error(`${path} must be an object`);
  if (value.type === "static") {
    if (typeof value.title !== "string" || typeof value.body !== "string") {
      throw new Error(`${path}: static content requires string "title" and "body"`);
    }
    return { type: "static", title: value.title, body: value.body };
  }
  if (value.type === "remote") {
    if (typeof value.sourceKey !== "string" || !value.sourceKey) {
      throw new Error(`${path}: remote content requires a non-empty "sourceKey"`);
    }
    return { type: "remote", sourceKey: value.sourceKey };
  }
  if (value.type === "component") {
    if (typeof value.appId !== "string" || !value.appId) {
      throw new Error(`${path}: component content requires a non-empty "appId"`);
    }
    const content: SurfaceContent = { type: "component", appId: value.appId };
    if (value.props !== undefined) content.props = value.props;
    return content;
  }
  if (value.type === "chart") {
    if (!isPlainObject(value.spec)) throw new Error(`${path}: chart content requires a "spec" object`);
    const content: SurfaceContent = { type: "chart", spec: value.spec as unknown as ChartSpec };
    if (value.dataKey !== undefined) {
      if (typeof value.dataKey !== "string") throw new Error(`${path}: dataKey must be a string`);
      if (!dataKeys.has(value.dataKey)) {
        throw new Error(`forbidden: ${path} references dataKey "${value.dataKey}" which the package does not declare`);
      }
      content.dataKey = value.dataKey;
    }
    return content;
  }
  throw new Error(`${path}: unsupported content type "${String(value.type)}" (static, remote, component or chart)`);
}

/**
 * Validates the optional `agent` section of a .vpk manifest. Throws an Error
 * naming the offending field; tool declarations carrying code entry fields are
 * rejected with an `unsupported_tool` message, cross-package references with
 * `forbidden`.
 */
export function parseAgentSection(value: unknown, packageId: string): VpkAgentSection {
  if (value === undefined) {
    return { surfaces: [], charts: [], datasources: [], tools: [] };
  }
  if (!isPlainObject(value)) throw new Error("manifest.agent must be an object");

  const known = ["surfaces", "charts", "datasources", "tools"];
  for (const key of Object.keys(value)) {
    if (!known.includes(key)) {
      throw new Error(`manifest.agent.${key}: unknown field (allowed: ${known.join(", ")})`);
    }
  }

  const datasources: VpkAgentDatasourceDecl[] = [];
  for (const entry of (value.datasources as unknown[] | undefined) ?? []) {
    if (!isPlainObject(entry)) throw new Error("manifest.agent.datasources entries must be objects");
    if (typeof entry.key !== "string" || !DECL_ID_PATTERN.test(entry.key)) {
      throw new Error(`manifest.agent.datasources.key must match ${DECL_ID_PATTERN.source}`);
    }
    if (typeof entry.tool !== "string" || !DECL_ID_PATTERN.test(entry.tool)) {
      throw new Error(`manifest.agent.datasources.tool must match ${DECL_ID_PATTERN.source}`);
    }
    if (datasources.some((existing) => existing.key === entry.key)) {
      throw new Error(`manifest.agent.datasources: duplicate key "${entry.key}"`);
    }
    datasources.push({ key: entry.key, tool: entry.tool });
  }
  const dataKeys = new Set(datasources.map((entry) => entry.key));

  const tools: VpkAgentToolDecl[] = [];
  for (const entry of (value.tools as unknown[] | undefined) ?? []) {
    if (!isPlainObject(entry)) throw new Error("manifest.agent.tools entries must be objects");
    for (const field of Object.keys(entry)) {
      if (!TOOL_FIELDS.has(field)) {
        if (CODE_ENTRY_FIELDS.includes(field)) {
          throw new Error(`unsupported_tool: manifest.agent.tools[${tools.length}].${field} — packages cannot ship tool code`);
        }
        throw new Error(`manifest.agent.tools[${tools.length}].${field}: unknown field`);
      }
    }
    if (typeof entry.name !== "string" || !DECL_ID_PATTERN.test(entry.name)) {
      throw new Error(`manifest.agent.tools[${tools.length}].name must match ${DECL_ID_PATTERN.source}`);
    }
    if (entry.type !== "http" && entry.type !== "static") {
      throw new Error(`unsupported_tool: manifest.agent.tools[${tools.length}].type must be "http" or "static"`);
    }
    const tool: VpkAgentToolDecl = {
      name: entry.name,
      type: entry.type,
      ...(typeof entry.description === "string" ? { description: entry.description } : {}),
    };
    if (tool.type === "http") {
      if (typeof entry.endpoint !== "string" || !/^https?:\/\//.test(entry.endpoint)) {
        throw new Error(`manifest.agent.tools[${tools.length}].endpoint must be an absolute http(s) URL`);
      }
      if (entry.method !== undefined && entry.method !== "GET" && entry.method !== "POST") {
        throw new Error(`manifest.agent.tools[${tools.length}].method must be GET or POST`);
      }
      tool.endpoint = entry.endpoint;
      if (entry.method !== undefined) tool.method = entry.method;
      if (entry.params !== undefined) {
        if (!isPlainObject(entry.params)) throw new Error(`manifest.agent.tools[${tools.length}].params must be an object`);
        const params: Record<string, "string" | "number" | "boolean"> = {};
        for (const [param, kind] of Object.entries(entry.params)) {
          if (kind !== "string" && kind !== "number" && kind !== "boolean") {
            throw new Error(`manifest.agent.tools[${tools.length}].params.${param} must be "string", "number" or "boolean"`);
          }
          params[param] = kind;
        }
        tool.params = params;
      }
      if (entry.required !== undefined) {
        if (!Array.isArray(entry.required) || entry.required.some((name) => typeof name !== "string")) {
          throw new Error(`manifest.agent.tools[${tools.length}].required must be an array of parameter names`);
        }
        tool.required = entry.required as string[];
      }
    } else {
      if (typeof entry.path !== "string" || !entry.path) {
        throw new Error(`manifest.agent.tools[${tools.length}].path is required for static tools`);
      }
      if (entry.path.startsWith("/") || entry.path.split("/").some((segment) => segment === ".." || segment === "")) {
        throw new Error(`forbidden: manifest.agent.tools[${tools.length}].path escapes the package directory`);
      }
      tool.path = entry.path;
    }
    if (tools.some((existing) => existing.name === tool.name)) {
      throw new Error(`manifest.agent.tools: duplicate tool name "${tool.name}"`);
    }
    tools.push(tool);
  }
  const toolNames = new Set(tools.map((tool) => tool.name));

  for (const datasource of datasources) {
    if (!toolNames.has(datasource.tool)) {
      throw new Error(`forbidden: datasource "${datasource.key}" references tool "${datasource.tool}" which the package does not declare`);
    }
  }

  const surfaces: VpkAgentSurfaceDecl[] = [];
  for (const entry of (value.surfaces as unknown[] | undefined) ?? []) {
    if (!isPlainObject(entry)) throw new Error("manifest.agent.surfaces entries must be objects");
    if (typeof entry.id !== "string" || !DECL_ID_PATTERN.test(entry.id)) {
      throw new Error(`manifest.agent.surfaces.id must match ${DECL_ID_PATTERN.source}`);
    }
    if (typeof entry.kind !== "string" || !SURFACE_KINDS.has(entry.kind)) {
      throw new Error(`manifest.agent.surfaces.kind must be one of: window, widget, panel`);
    }
    if (entry.window !== undefined || entry.html !== undefined || entry.url !== undefined) {
      throw new Error(`manifest.agent.surfaces[${entry.id}]: html/url/window content is not allowed`);
    }
    surfaces.push({
      id: entry.id,
      kind: entry.kind as VpkAgentSurfaceDecl["kind"],
      ...(typeof entry.title === "string" ? { title: entry.title } : {}),
      geometry: parseGeometryDecl(entry.geometry, `manifest.agent.surfaces[${entry.id}].geometry`),
      content: parseContentDecl(entry.content, `manifest.agent.surfaces[${entry.id}].content`, dataKeys),
    });
  }

  const charts: VpkAgentChartDecl[] = [];
  for (const entry of (value.charts as unknown[] | undefined) ?? []) {
    if (!isPlainObject(entry)) throw new Error("manifest.agent.charts entries must be objects");
    if (typeof entry.id !== "string" || !DECL_ID_PATTERN.test(entry.id)) {
      throw new Error(`manifest.agent.charts.id must match ${DECL_ID_PATTERN.source}`);
    }
    if (!isPlainObject(entry.spec)) throw new Error(`manifest.agent.charts[${entry.id}].spec must be an object`);
    const chart: VpkAgentChartDecl = { id: entry.id, spec: entry.spec as unknown as ChartSpec };
    if (typeof entry.title === "string") chart.title = entry.title;
    if (entry.dataKey !== undefined) {
      if (typeof entry.dataKey !== "string") throw new Error(`manifest.agent.charts[${entry.id}].dataKey must be a string`);
      if (!dataKeys.has(entry.dataKey)) {
        throw new Error(`forbidden: chart "${entry.id}" references dataKey "${entry.dataKey}" which the package does not declare`);
      }
      chart.dataKey = entry.dataKey;
    }
    if (entry.geometry !== undefined) {
      chart.geometry = parseGeometryDecl(entry.geometry, `manifest.agent.charts[${entry.id}].geometry`);
    }
    charts.push(chart);
  }

  return { surfaces, charts, datasources, tools };
}

const PERMISSION_PATTERN = /^(surface:create|signal:publish|net:[a-z0-9.-]+(?::\d+)?)$/;

/** Validates the optional `permissions` array of a .vpk manifest. */
export function parsePermissions(value: unknown, packageId: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error("manifest.permissions must be an array of strings");
  }
  const permissions: string[] = [];
  for (const entry of value as string[]) {
    if (!PERMISSION_PATTERN.test(entry)) {
      throw new Error(`manifest.permissions: "${entry}" is not a valid permission (surface:create, signal:publish, net:<host>)`);
    }
    if (!permissions.includes(entry)) permissions.push(entry);
  }
  void packageId;
  return permissions;
}

/** Human-readable line for the install consent dialog. */
export function describePermission(permission: string): string {
  if (permission === "surface:create") return "Create desktop surfaces (widgets, charts, panels)";
  if (permission === "signal:publish") return "Publish data to the desktop";
  if (permission.startsWith("net:")) return `Network access to ${permission.slice(4)}`;
  return permission;
}

const GRANTS_FILE = "grants.json";

export function readGrants(vfs: Vfs, packageId: string): VpkGrants | null {
  try {
    const grants = JSON.parse(vfs.read(`/Apps/${packageId}/${GRANTS_FILE}`)) as VpkGrants;
    if (!grants || grants.id !== packageId || !Array.isArray(grants.permissions)) return null;
    return grants;
  } catch {
    return null;
  }
}

export function writeGrants(vfs: Vfs, packageId: string, permissions: string[]): void {
  const grants: VpkGrants = { id: packageId, permissions, grantedAt: Date.now() };
  vfs.write(`/Apps/${packageId}/${GRANTS_FILE}`, JSON.stringify(grants, null, 2));
}

export interface PackageRegistrationProposal {
  action: "register" | "unregister";
  id: string;
  tools: Array<Record<string, unknown>>;
  datasources: VpkAgentDatasourceDecl[];
  surfaces: Array<{
    id: string;
    kind: "window" | "widget" | "panel";
    title: string;
    geometry: { x: number; y: number; width: number; height: number };
    content: SurfaceContent;
  }>;
}

function propose(proposal: PackageRegistrationProposal): void {
  try {
    serviceSession.signal<unknown>(PACKAGES_PROPOSAL_KEY, null).set(proposal);
  } catch {
    // Without a service the declarations still live in the local registry.
  }
}

/**
 * Registers a package's declared surfaces and charts into the local
 * SurfaceRegistry under the `pkg.<id>` owner namespace and proposes the tool
 * declarations to the Node service, which exposes them as MCP tools.
 */
export function registerPackageAgent(
  pkg: VpkPackage,
  deps: { surfaces: SurfaceRegistry; session?: RemoteSession | null },
): void {
  const { surfaces } = deps;
  const agent = pkg.manifest.agent;
  if (!agent) return;
  const packageId = pkg.manifest.id;
  const owner = `pkg.${packageId}`;

  for (const surface of agent.surfaces) {
    const id = `${packageId}.${surface.id}`;
    if (surfaces.has(id)) continue;
    surfaces.create({
      id,
      owner,
      kind: surface.kind,
      title: surface.title ?? surface.id,
      geometry: surface.geometry,
      content: surface.content,
      persist: true,
    });
  }
  for (const chart of agent.charts) {
    const id = `${packageId}.${chart.id}`;
    if (surfaces.has(id)) continue;
    surfaces.create({
      id,
      owner,
      kind: "widget",
      title: chart.title ?? chart.id,
      geometry: chart.geometry ?? { x: 48, y: 48, width: 340, height: 220 },
      content: { type: "chart", spec: chart.spec, ...(chart.dataKey ? { dataKey: chart.dataKey } : {}) },
      persist: true,
    });
  }

  const tools = agent.tools.map((tool) => {
    if (tool.type === "static") {
      return {
        name: tool.name,
        type: "static",
        ...(tool.description ? { description: tool.description } : {}),
        path: tool.path,
        content: (tool.path && pkg.files[tool.path]) ?? "",
      };
    }
    return {
      name: tool.name,
      type: "http",
      ...(tool.description ? { description: tool.description } : {}),
      endpoint: tool.endpoint,
      method: tool.method ?? "GET",
      ...(tool.params ? { params: tool.params } : {}),
      ...(tool.required ? { required: tool.required } : {}),
      netHosts: (pkg.manifest.permissions ?? [])
        .filter((permission) => permission.startsWith("net:"))
        .map((permission) => permission.slice(4)),
    };
  });

  propose({
    action: "register",
    id: packageId,
    tools,
    datasources: agent.datasources,
    surfaces: [
      ...agent.surfaces.map((surface) => ({
        id: surface.id,
        kind: surface.kind,
        title: surface.title ?? surface.id,
        geometry: surface.geometry,
        content: surface.content,
      })),
      ...agent.charts.map((chart) => ({
        id: chart.id,
        kind: "widget" as const,
        title: chart.title ?? chart.id,
        geometry: chart.geometry ?? { x: 48, y: 48, width: 340, height: 220 },
        content: {
          type: "chart" as const,
          spec: chart.spec,
          ...(chart.dataKey ? { dataKey: chart.dataKey } : {}),
        },
      })),
    ],
  });
}

/** Removes a package's declared surfaces and proposes tool unregistration. */
export function unregisterPackageAgent(packageId: string, deps: { surfaces: SurfaceRegistry }): void {
  const owner = `pkg.${packageId}`;
  for (const record of deps.surfaces.list(owner)) {
    deps.surfaces.destroy(record.id);
  }
  propose({ action: "unregister", id: packageId, tools: [], datasources: [], surfaces: [] });
}

/** Startup replay: register declarations only for packages the user granted. */
export function registerInstalledAgentPackages(
  vfs: Vfs,
  deps: { surfaces: SurfaceRegistry; packages: VpkPackage[] },
): void {
  for (const pkg of deps.packages) {
    if (!pkg.manifest.agent) continue;
    const grants = readGrants(vfs, pkg.manifest.id);
    if (!grants) continue;
    registerPackageAgent(pkg, { surfaces: deps.surfaces });
  }
}

/** Removes every VFS trace of a package (files, grants) and unregisters its app. */
export function uninstallPackageFiles(vfs: Vfs, packageId: string): void {
  vfs.remove(`/Apps/${packageId}`);
}

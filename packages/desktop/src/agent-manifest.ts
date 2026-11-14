import type { SurfaceRegistry, SurfaceContent, Vfs } from "@vela/core";
import type { RemoteSession } from "@vela/remote";
import {
  parseAgentSection,
  parsePermissions,
  type VpkAgentChartDecl,
  type VpkAgentDatasourceDecl,
  type VpkAgentSection,
  type VpkAgentSurfaceDecl,
  type VpkAgentToolDecl,
  type VpkPackage,
} from "@vela/vpk";
import { serviceSession } from "./services";

// Manifest validation lives in @vela/vpk (shared with the CLI and the
// playground); re-exported here so the shell keeps a single import surface.
export {
  parseAgentSection,
  parsePermissions,
} from "@vela/vpk";
export type {
  VpkAgentChartDecl,
  VpkAgentDatasourceDecl,
  VpkAgentSection,
  VpkAgentSurfaceDecl,
  VpkAgentToolDecl,
} from "@vela/vpk";

/** Well-known propose key the shell uses to sync package declarations to the service. */
export const PACKAGES_PROPOSAL_KEY = "agent.packages";

export interface VpkGrants {
  id: string;
  permissions: string[];
  grantedAt: number;
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

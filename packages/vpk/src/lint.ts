import { parseVpk, type VpkManifest } from "./core";

export interface LintFileInfo {
  path: string;
  bytes: number;
}

export interface LintResult {
  ok: boolean;
  /** Parse/validation error message when ok is false. */
  error?: string;
  manifest?: Pick<VpkManifest, "id" | "name" | "version" | "entry" | "icon" | "window" | "permissions"> & {
    agent?: { surfaces: number; charts: number; datasources: number; tools: number };
  };
  files?: LintFileInfo[];
  totalBytes?: number;
}

const encoder = new TextEncoder();

/**
 * Validates a .vpk archive without running it. Pure validation — the same
 * `parseVpk` pipeline the desktop installer uses, so lint failures are install
 * failures.
 */
export function lintVpk(buffer: ArrayBuffer): LintResult {
  try {
    const pkg = parseVpk(buffer);
    const files = Object.entries(pkg.files)
      .map(([path, content]) => ({ path, bytes: encoder.encode(content).byteLength }))
      .sort((a, b) => a.path.localeCompare(b.path));
    const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
    const { agent, ...manifest } = pkg.manifest;
    return {
      ok: true,
      manifest: {
        ...manifest,
        ...(agent
          ? {
              agent: {
                surfaces: agent.surfaces.length,
                charts: agent.charts.length,
                datasources: agent.datasources.length,
                tools: agent.tools.length,
              },
            }
          : {}),
      },
      files,
      totalBytes,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
}

/** Human-readable multi-line report for the CLI. */
export function formatLintResult(result: LintResult): string {
  if (!result.ok) return `✘ ${result.error ?? "invalid package"}`;
  const manifest = result.manifest!;
  const lines = [
    `✔ manifest ok: ${manifest.id} v${manifest.version} ("${manifest.name}")`,
    `  entry: ${manifest.entry}`,
    `  window: ${manifest.window ? `${manifest.window.width}×${manifest.window.height}` : "default"}`,
    `  permissions: ${manifest.permissions?.length ? manifest.permissions.join(", ") : "(none)"}`,
    ...(manifest.agent
      ? [
          `  agent: ${manifest.agent.surfaces} surfaces, ${manifest.agent.charts} charts, ${manifest.agent.datasources} datasources, ${manifest.agent.tools} tools`,
        ]
      : []),
    `  files: ${result.files!.length} (${formatBytes(result.totalBytes!)})`,
    ...result.files!.map((file) => `    ${file.path}  ${formatBytes(file.bytes)}`),
  ];
  return lines.join("\n");
}

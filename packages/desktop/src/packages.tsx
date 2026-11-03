import { createMemo, onCleanup, Show, type JSX } from "solid-js";
import { unzipSync, strFromU8 } from "fflate";
import type { AppDefinition, AppRegistry, Vfs } from "@vela/core";
import { Label } from "@vela/ui";
import { useDesktop } from "./context";
import { parseAgentSection, parsePermissions } from "./agent-manifest";
import type { VpkAgentSection } from "./agent-manifest";

export interface VpkManifest {
  id: string;
  name: string;
  version: string;
  entry: string;
  icon?: string;
  window?: { width: number; height: number };
  /** Optional declarative agent capability block; validated on parse. */
  agent?: VpkAgentSection;
  /** Permissions the package needs; installs require explicit user consent. */
  permissions?: string[];
}

export interface VpkPackage {
  manifest: VpkManifest;
  files: Record<string, string>;
}

const MANIFEST_PATH = "manifest.json";
const MAX_FILES = 64;
const MAX_FILE_BYTES = 5_000_000;
const MAX_TOTAL_BYTES = 6_000_000;
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,31}$/;
const RESERVED_IDS = new Set(["about", "files", "editor", "terminal", "marketplace", "service", "settings"]);

function safeArchivePath(path: string): string | null {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\/+/, "");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0")) return null;
  const parts = normalized.split("/");
  if (parts.some((part) => part === ".." || part === "." || part === "")) return null;
  return normalized;
}

export function parseManifest(value: unknown): VpkManifest {
  if (typeof value !== "object" || value === null) throw new Error("manifest.json must be an object");
  const manifest = value as Record<string, unknown>;
  if (typeof manifest.id !== "string" || !ID_PATTERN.test(manifest.id)) {
    throw new Error("manifest.id must match ^[a-z0-9][a-z0-9-]{1,31}$");
  }
  if (RESERVED_IDS.has(manifest.id)) {
    throw new Error(`manifest.id is reserved by a built-in app: ${manifest.id}`);
  }
  if (typeof manifest.name !== "string" || !manifest.name.trim()) {
    throw new Error("manifest.name is required");
  }
  if (typeof manifest.version !== "string" || !manifest.version.trim()) {
    throw new Error("manifest.version is required");
  }
  if (typeof manifest.entry !== "string" || !manifest.entry.endsWith(".html")) {
    throw new Error("manifest.entry must be an HTML file");
  }
  const entry = safeArchivePath(manifest.entry);
  if (!entry) throw new Error("manifest.entry has an unsafe path");

  let geometry: VpkManifest["window"];
  if (manifest.window !== undefined) {
    if (typeof manifest.window !== "object" || manifest.window === null) {
      throw new Error("manifest.window must be an object");
    }
    const window = manifest.window as Record<string, unknown>;
    if (
      typeof window.width !== "number" ||
      typeof window.height !== "number" ||
      !Number.isFinite(window.width) ||
      !Number.isFinite(window.height) ||
      window.width < 240 ||
      window.height < 180
    ) {
      throw new Error("manifest.window requires width >= 240 and height >= 180");
    }
    geometry = {
      width: Math.round(window.width),
      height: Math.round(window.height),
    };
  }

  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    entry,
    icon: typeof manifest.icon === "string" ? manifest.icon.slice(0, 4) : "▣",
    ...(geometry ? { window: geometry } : {}),
    ...(manifest.agent !== undefined
      ? { agent: parseAgentSection(manifest.agent, manifest.id) }
      : {}),
    ...(manifest.permissions !== undefined
      ? { permissions: parsePermissions(manifest.permissions, manifest.id) }
      : {}),
  };
}

export function parseVpk(buffer: ArrayBuffer): VpkPackage {
  let total = 0;
  const archive = unzipSync(new Uint8Array(buffer), {
    filter: (file) => {
      if (file.originalSize > MAX_FILE_BYTES) {
        throw new Error(`File is too large: ${file.name}`);
      }
      total += file.originalSize;
      if (total > MAX_TOTAL_BYTES) throw new Error("Package exceeds the 6 MB limit");
      return true;
    },
  });
  const names = Object.keys(archive).filter((name) => !name.endsWith("/"));
  if (names.length === 0) throw new Error("Package is empty");
  if (names.length > MAX_FILES) throw new Error(`Package has more than ${MAX_FILES} files`);

  const files: Record<string, string> = {};
  total = 0;
  for (const name of names) {
    const safe = safeArchivePath(name);
    if (!safe) throw new Error(`Unsafe package path: ${name}`);
    const bytes = archive[name];
    if (!bytes) continue;
    if (bytes.byteLength > MAX_FILE_BYTES) throw new Error(`File is too large: ${safe}`);
    total += bytes.byteLength;
    if (total > MAX_TOTAL_BYTES) throw new Error("Package exceeds the 6 MB limit");
    files[safe] = strFromU8(bytes);
  }

  const rawManifest = files[MANIFEST_PATH];
  if (!rawManifest) throw new Error("manifest.json must be at the package root");
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawManifest);
  } catch {
    throw new Error("manifest.json is not valid JSON");
  }
  const manifest = parseManifest(parsed);
  if (!files[manifest.entry]) throw new Error(`Entry not found: ${manifest.entry}`);
  return { manifest, files };
}

function packageFiles(vfs: Vfs, packageId: string): Record<string, string> {
  const root = `/Apps/${packageId}`;
  const files: Record<string, string> = {};
  const walk = (dir: string, prefix: string): void => {
    for (const entry of vfs.list(dir)) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.kind === "dir") walk(entry.path, relative);
      else files[relative] = vfs.read(entry.path);
    }
  };
  walk(root, "");
  return files;
}

export function installPackage(vfs: Vfs, pkg: VpkPackage): void {
  const root = `/Apps/${pkg.manifest.id}`;
  vfs.mkdir(root);
  for (const [relative, content] of Object.entries(pkg.files)) {
    vfs.write(`${root}/${relative}`, content);
  }
}

/** Removes the package directory (including its grants.json) and unregisters the app. */
export function uninstallPackage(vfs: Vfs, apps: AppRegistry, packageId: string): void {
  vfs.remove(`/Apps/${packageId}`);
  if (apps.find(packageId)) apps.unregister(packageId);
}

export function readInstalledPackage(vfs: Vfs, packageId: string): VpkPackage | null {
  try {
    const manifest = parseManifest(JSON.parse(vfs.read(`/Apps/${packageId}/manifest.json`)));
    const files = packageFiles(vfs, packageId);
    if (!files[manifest.entry]) return null;
    return { manifest, files };
  } catch {
    return null;
  }
}

export function listInstalledPackages(vfs: Vfs): VpkPackage[] {
  try {
    const packages: VpkPackage[] = [];
    for (const entry of vfs.list("/Apps")) {
      if (entry.kind !== "dir") continue;
      const pkg = readInstalledPackage(vfs, entry.name);
      if (pkg) packages.push(pkg);
    }
    return packages;
  } catch {
    return [];
  }
}

function mimeFor(path: string): string {
  if (path.endsWith(".css")) return "text/css";
  if (path.endsWith(".js") || path.endsWith(".mjs")) return "text/javascript";
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".html")) return "text/html";
  return "text/plain";
}

function packageDocument(pkg: VpkPackage): { html: string; revoke: () => void } {
  const urls = new Map<string, string>();
  for (const [path, content] of Object.entries(pkg.files)) {
    if (path === pkg.manifest.entry) continue;
    const blob = new Blob([content], { type: mimeFor(path) });
    urls.set(path, URL.createObjectURL(blob));
  }

  const entry = pkg.files[pkg.manifest.entry] ?? "";
  const inlineAssets = entry
    .replace(
      /<link\b[^>]*href=("|')([^"']+)\1[^>]*>/gi,
      (match, _quote: string, value: string) => {
        const path = value.replace(/^\.\/+/, "");
        const css = pkg.files[path];
        return css === undefined ? match : `<style>${css}</style>`;
      },
    )
    .replace(
      /<script\b([^>]*?)src=("|')([^"']+)\2([^>]*)><\/script>/gi,
      (match, before: string, _quote: string, value: string, after: string) => {
        const path = value.replace(/^\.\/+/, "");
        const script = pkg.files[path];
        if (script === undefined) return match;
        const attributes = `${before ?? ""}${after ?? ""}`.trim();
        return `<script${attributes ? ` ${attributes}` : ""}>${script}</script>`;
      },
    );
  const rewritten = inlineAssets.replace(
    /\b(href|src)=("|')([^"']+)\2/g,
    (match, attribute: string, quote: string, value: string) => {
      if (/^(?:#|https?:|data:|blob:|mailto:)/i.test(value)) return match;
      const path = value.replace(/^\.\/+/, "");
      const url = urls.get(path);
      return url ? `${attribute}=${quote}${url}${quote}` : match;
    },
  );
  const csp =
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\' blob:; script-src \'unsafe-inline\' blob:; img-src data: blob:; font-src data: blob:;">';
  const html = /<head[^>]*>/i.test(rewritten)
    ? rewritten.replace(/<head[^>]*>/i, (head) => `${head}${csp}`)
    : `${csp}${rewritten}`;

  return {
    html,
    revoke: () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
    },
  };
}

export function PackageApp(props: { packageId: string }): JSX.Element {
  const { vfs } = useDesktop();
  const document = createMemo(() => {
    const pkg = readInstalledPackage(vfs, props.packageId);
    return pkg ? packageDocument(pkg) : null;
  });
  onCleanup(() => document()?.revoke());

  return (
    <Show
      when={document()}
      fallback={<Label muted>This app package is not installed.</Label>}
    >
      {(content) => (
        <iframe
          class="vela-package-frame"
          title={props.packageId}
          sandbox="allow-scripts"
          srcdoc={content().html}
        />
      )}
    </Show>
  );
}

export function registerPackageApp(apps: AppRegistry, manifest: VpkManifest): void {
  if (apps.find(manifest.id)) apps.unregister(manifest.id);
  const app: AppDefinition = {
    id: manifest.id,
    title: manifest.name,
    icon: manifest.icon ?? "▣",
    component: () => <PackageApp packageId={manifest.id} />,
    ...(manifest.window ? { defaultGeometry: manifest.window } : {}),
  };
  apps.register(app);
}

export function registerInstalledPackages(apps: AppRegistry, vfs: Vfs): void {
  for (const pkg of listInstalledPackages(vfs)) {
    if (!apps.find(pkg.manifest.id)) registerPackageApp(apps, pkg.manifest);
  }
}

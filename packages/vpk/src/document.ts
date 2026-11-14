import { BRIDGE_SCRIPT } from "./bridge";
import type { VpkPackage } from "./core";

function mimeFor(path: string): string {
  if (path.endsWith(".css")) return "text/css";
  if (path.endsWith(".js") || path.endsWith(".mjs")) return "text/javascript";
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".html")) return "text/html";
  return "text/plain";
}

export interface PackageDocumentOptions {
  /** Inject the console bridge script (debug hosts only; the desktop never enables it). */
  debugConsole?: boolean;
}

export function packageDocument(
  pkg: VpkPackage,
  options: PackageDocumentOptions = {},
): { html: string; revoke: () => void } {
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
  const debugScript = options.debugConsole ? `<script>${BRIDGE_SCRIPT}</script>` : "";
  const html = /<head[^>]*>/i.test(rewritten)
    ? rewritten.replace(/<head[^>]*>/i, (head) => `${head}${csp}${debugScript}`)
    : `${csp}${debugScript}${rewritten}`;

  return {
    html,
    revoke: () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
    },
  };
}

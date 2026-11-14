import { isVpkBridgeMessage, type VpkBridgeMessage } from "./bridge";
import { parseVpk } from "./core";
import { packageDocument } from "./document";

/**
 * Framework-free browser host for .vpk packages: parse → packageDocument →
 * sandboxed iframe. Used by the CLI `vpk run` host page; the desktop and the
 * playground render the iframe themselves through the same pipeline.
 */
export interface MountVpkHostOptions {
  /** Forward console/error messages out of the sandboxed frame. */
  onConsole?: (message: VpkBridgeMessage) => void;
  /** Inject the console bridge script (implies debug semantics). */
  debugConsole?: boolean;
}

export interface VpkHostMount {
  manifest: { id: string; name: string; version: string; entry: string };
  revoke: () => void;
}

export function mountVpkHost(
  root: HTMLElement,
  bytes: ArrayBuffer,
  options: MountVpkHostOptions = {},
): VpkHostMount {
  const pkg = parseVpk(bytes);
  const document_ = packageDocument(pkg, { debugConsole: options.debugConsole });

  const iframe = window.document.createElement("iframe");
  iframe.className = "vela-package-frame";
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.srcdoc = document_.html;
  iframe.title = pkg.manifest.id;
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.minHeight = "320px";
  iframe.style.border = "0";
  iframe.style.display = "block";

  const onMessage = (event: MessageEvent): void => {
    if (event.source !== iframe.contentWindow) return;
    if (!isVpkBridgeMessage(event.data)) return;
    options.onConsole?.(event.data);
  };

  root.replaceChildren(iframe);

  return {
    manifest: {
      id: pkg.manifest.id,
      name: pkg.manifest.name,
      version: pkg.manifest.version,
      entry: pkg.manifest.entry,
    },
    revoke: () => {
      window.removeEventListener("message", onMessage);
      document_.revoke();
      iframe.remove();
    },
  };
}

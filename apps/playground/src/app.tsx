import { createSignal, For, onCleanup, onMount, Show, type JSX } from "solid-js";
import { MemoryVfs } from "@vela/core";
import {
  installPackage,
  isVpkBridgeMessage,
  listInstalledPackages,
  packageDocument,
  parseVpk,
  readInstalledPackage,
  type VpkBridgeMessage,
  type VpkManifest,
} from "@vela/vpk";

/** Matches the shell's default open geometry (DesktopShell.openApp). */
const DEFAULT_WINDOW = { width: 640, height: 460 };
const encoder = new TextEncoder();

function byteLength(content: string): number {
  return encoder.encode(content).byteLength;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
}

export default function PlaygroundApp(): JSX.Element {
  const vfs = new MemoryVfs();
  const [installed, setInstalled] = createSignal<VpkManifest[]>([]);
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [status, setStatus] = createSignal<string | null>(null);
  const [debug, setDebug] = createSignal(false);
  const [fillMode, setFillMode] = createSignal(false);
  const [logs, setLogs] = createSignal<VpkBridgeMessage[]>([]);
  const [runCount, setRunCount] = createSignal(0);
  const [busy, setBusy] = createSignal(false);
  const [dragging, setDragging] = createSignal(false);
  const [urlInput, setUrlInput] = createSignal("");
  let activeFrame: HTMLIFrameElement | null = null;

  const refresh = (): void => {
    setInstalled(listInstalledPackages(vfs).map((pkg) => pkg.manifest));
  };
  refresh();

  /** Throws on invalid packages; callers surface the message. */
  const installBytes = async (bytes: ArrayBuffer, source: string): Promise<void> => {
    const pkg = parseVpk(bytes);
    if (readInstalledPackage(vfs, pkg.manifest.id)) {
      // Drop the previous version so stale files never survive a reinstall.
      vfs.remove(`/Apps/${pkg.manifest.id}`);
    }
    installPackage(vfs, pkg);
    refresh();
    setSelectedId(pkg.manifest.id);
    setRunCount((count) => count + 1);
    setError(null);
    setStatus(`Installed ${pkg.manifest.id} v${pkg.manifest.version} from ${source}`);
  };

  const installFile = async (file: File): Promise<void> => {
    setBusy(true);
    setStatus(null);
    try {
      await installBytes(await file.arrayBuffer(), file.name);
    } catch (cause) {
      setStatus(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const installFromUrl = async (url: string): Promise<void> => {
    setBusy(true);
    setStatus(null);
    setError(null);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);
      await installBytes(await response.arrayBuffer(), url);
    } catch (cause) {
      setStatus(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const remove = (id: string): void => {
    vfs.remove(`/Apps/${id}`);
    if (selectedId() === id) setSelectedId(null);
    refresh();
    setStatus(`Uninstalled ${id}`);
  };

  const run = (id: string): void => {
    setSelectedId(id);
    setRunCount((count) => count + 1);
    setStatus(null);
    setError(null);
  };

  onMount(() => {
    const src = new URLSearchParams(window.location.search).get("src");
    if (src) {
      setUrlInput(src);
      void installFromUrl(src);
    }
    const onMessage = (event: MessageEvent): void => {
      if (event.source !== activeFrame?.contentWindow) return;
      if (!isVpkBridgeMessage(event.data)) return;
      setLogs((current) => [...current, event.data]);
    };
    window.addEventListener("message", onMessage);
    onCleanup(() => window.removeEventListener("message", onMessage));
  });

  const selected = (): ReturnType<typeof readInstalledPackage> =>
    selectedId() ? readInstalledPackage(vfs, selectedId()!) : null;
  const manifest = (): VpkManifest | null => selected()?.manifest ?? null;
  const files = (): Array<[string, string]> =>
    selected() ? Object.entries(selected()!.files).sort(([a], [b]) => a.localeCompare(b)) : [];
  const runGeometry = (): { width: number; height: number } =>
    manifest()?.window ?? DEFAULT_WINDOW;
  const runKey = (): string => `${selectedId() ?? ""}:${runCount()}:${debug() ? "debug" : "plain"}`;

  return (
    <div class="playground">
      <header class="pg-header">
        <h1>VPK Playground</h1>
        <p class="pg-subtitle">
          Install and run .vpk packages with the exact desktop pipeline — no desktop shell required.
        </p>
        <label class="pg-toggle" data-testid="vpk-debug-toggle">
          <input
            type="checkbox"
            checked={debug()}
            onInput={(event) => setDebug(event.currentTarget.checked)}
          />
          Debug mode (console bridge)
        </label>
      </header>

      <div class="pg-layout">
        <aside class="pg-side">
          <section
            class="pg-dropzone"
            classList={{ "is-dragging": dragging() }}
            data-testid="vpk-dropzone"
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const file = event.dataTransfer?.files[0];
              if (file) void installFile(file);
            }}
          >
            <strong>Drop a .vpk here</strong>
            <span>or</span>
            <label class="pg-button">
              Choose file…
              <input
                type="file"
                accept=".vpk,application/zip"
                data-testid="vpk-file-input"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) void installFile(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </section>

          <section class="pg-url">
            <input
              type="url"
              placeholder="https://…/app.vpk (?src= supported)"
              data-testid="vpk-url-input"
              value={urlInput()}
              onInput={(event) => setUrlInput(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && urlInput()) void installFromUrl(urlInput());
              }}
            />
            <button
              class="pg-button"
              data-testid="vpk-url-install"
              disabled={!urlInput() || busy()}
              onClick={() => void installFromUrl(urlInput())}
            >
              Fetch
            </button>
          </section>

          <Show when={error()}>
            {(message) => <p class="pg-error">{message()}</p>}
          </Show>
          <Show when={status()}>
            {(message) => <p class="pg-status">{message()}</p>}
          </Show>

          <section class="pg-installed">
            <h2>Installed ({installed().length})</h2>
            <Show
              when={installed().length > 0}
              fallback={<p class="pg-muted">No packages installed in this session.</p>}
            >
              <ul data-testid="vpk-installed">
                <For each={installed()}>
                  {(item) => (
                    <li data-package-id={item.id}>
                      <button
                        class="pg-open"
                        title={item.id}
                        onClick={() => run(item.id)}
                      >
                        <span class="pg-icon">{item.icon ?? "▣"}</span>
                        <span class="pg-name">
                          {item.name}
                          <small>v{item.version}</small>
                        </span>
                      </button>
                      <button class="pg-remove" onClick={() => remove(item.id)}>
                        Uninstall
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </section>
        </aside>

        <main class="pg-main">
          <Show
            when={manifest()}
            fallback={<p class="pg-muted pg-empty">Select or install a package to run it.</p>}
          >
            {(item) => (
              <>
                <div class="pg-info" data-testid="vpk-info">
                  <h2>
                    <span class="pg-icon">{item().icon ?? "▣"}</span>
                    {item().name}{" "}
                    <small data-testid="vpk-info-id">
                      {item().id} · v{item().version}
                    </small>
                  </h2>
                  <dl>
                    <dt>entry</dt>
                    <dd>{item().entry}</dd>
                    <dt>window</dt>
                    <dd>
                      {item().window
                        ? `${item().window!.width}×${item().window!.height}`
                        : `${DEFAULT_WINDOW.width}×${DEFAULT_WINDOW.height} (default)`}
                    </dd>
                    <dt>permissions</dt>
                    <dd>
                      <Show
                        when={item().permissions !== undefined && item().permissions!.length > 0}
                        fallback={<span class="pg-muted">(none)</span>}
                      >
                        <span>{item().permissions!.join(", ")}</span>
                      </Show>
                    </dd>
                    <Show when={item().agent !== undefined}>
                      <>
                        <dt>agent</dt>
                        <dd>
                          {item().agent!.surfaces.length} surfaces, {item().agent!.charts.length}{" "}
                          charts, {item().agent!.datasources.length} datasources,{" "}
                          {item().agent!.tools.length} tools
                        </dd>
                      </>
                    </Show>
                  </dl>
                  <details class="pg-files">
                    <summary>
                      Files ({files().length},{" "}
                      {formatBytes(files().reduce((sum, [, content]) => sum + byteLength(content), 0))})
                    </summary>
                    <table>
                      <tbody>
                        <For each={files()}>
                          {([path, content]) => (
                            <tr>
                              <td>{path}</td>
                              <td>{formatBytes(byteLength(content))}</td>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                  </details>
                </div>

                <div class="pg-run-toolbar">
                  <label class="pg-toggle" data-testid="vpk-fill-toggle">
                    <input
                      type="checkbox"
                      checked={fillMode()}
                      onInput={(event) => setFillMode(event.currentTarget.checked)}
                    />
                    Fill panel (ignore window size)
                  </label>
                </div>
                <div
                  class="pg-run-frame"
                  data-testid="vpk-run-frame"
                  style={
                    fillMode()
                      ? {}
                      : {
                          width: `${runGeometry().width}px`,
                          height: `${runGeometry().height}px`,
                        }
                  }
                >
                  <Show when={runKey()} keyed>
                    {(_) => {
                      // The outer Show already gates on the package being readable.
                      const pkg = selected()!;
                      const doc = packageDocument(pkg, { debugConsole: debug() });
                      onCleanup(() => doc.revoke());
                      return (
                        <iframe
                          class="vela-run-iframe"
                          data-testid="vpk-run-iframe"
                          title={pkg.manifest.id}
                          sandbox="allow-scripts"
                          srcdoc={doc.html}
                          ref={(element) => {
                            activeFrame = element;
                            onCleanup(() => {
                              if (activeFrame === element) activeFrame = null;
                            });
                          }}
                        />
                      );
                    }}
                  </Show>
                </div>

                <Show when={debug()}>
                  <div class="pg-console" data-testid="vpk-console">
                    <div class="pg-console-head">
                      <h2>Console ({logs().length})</h2>
                      <button class="pg-button" onClick={() => setLogs([])}>
                        Clear
                      </button>
                    </div>
                    <Show
                      when={logs().length > 0}
                      fallback={<p class="pg-muted">No package console output captured yet.</p>}
                    >
                      <ul>
                        <For each={logs()}>
                          {(message, index) => (
                            <li
                              class="pg-log-line"
                              data-level={message.level}
                              data-testid={`vpk-log-${index()}`}
                            >
                              <span class="pg-log-level">{message.level}</span>
                              {message.text}
                            </li>
                          )}
                        </For>
                      </ul>
                    </Show>
                  </div>
                </Show>
              </>
            )}
          </Show>
        </main>
      </div>
    </div>
  );
}

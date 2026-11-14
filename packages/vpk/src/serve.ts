import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";

export interface RunServerOptions {
  port?: number;
  debugConsole?: boolean;
  /** Path to the prebuilt IIFE host bundle (dist/host.js); defaults to the sibling dist file. */
  hostJsPath?: string | URL;
}

export interface RunServerHandle {
  server: Server;
  url: string;
  port: number;
  close: () => Promise<void>;
}

const HOST_PAGE = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>vpk run — Vela package debug host</title>
    <style>
      html, body { margin: 0; height: 100%; background: #0b1120; }
      #root { height: 100%; }
      #error { color: #f87171; font: 13px/1.6 monospace; padding: 16px; white-space: pre-wrap; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <div id="error" hidden></div>
    <script type="module">
      const errorBox = document.getElementById("error");
      const fail = (message) => {
        errorBox.hidden = false;
        errorBox.textContent = message;
      };
      fetch("/package.vpk")
        .then((response) => {
          if (!response.ok) throw new Error("/package.vpk -> HTTP " + response.status);
          return response.arrayBuffer();
        })
        .then((bytes) => {
          return import("/host.js").then(({ mountVpkHost }) => {
            mountVpkHost(document.getElementById("root"), bytes, {
              debugConsole: DEBUG_CONSOLE,
              onConsole: (message) => {
                (console[message.level] ?? console.log).call(console, "[vpk] " + message.text);
              },
            });
          });
        })
        .catch((error) => fail(String(error && error.stack ? error.stack : error)));
    </script>
  </body>
</html>`;

const MIME: Record<string, string> = {
  "/": "text/html; charset=utf-8",
  "/host.js": "text/javascript; charset=utf-8",
  "/package.vpk": "application/zip",
};

/**
 * Local debug server for a single .vpk file. `/package.vpk` is read from disk
 * on every request, so rebuilding the package only requires a browser refresh.
 */
export async function createRunServer(vpkPath: string, options: RunServerOptions = {}): Promise<RunServerHandle> {
  const hostJsPath = options.hostJsPath ?? new URL("./host.js", import.meta.url);
  const server = createServer(async (request, response) => {
    const path = (request.url ?? "/").split("?")[0] ?? "/";
    try {
      if (path === "/") {
        response.writeHead(200, {
          "content-type": MIME["/"]!,
          "cache-control": "no-store",
        });
        response.end(HOST_PAGE.replace("DEBUG_CONSOLE", options.debugConsole ? "true" : "false"));
        return;
      }
      if (path === "/host.js") {
        const hostJs = await readFile(hostJsPath);
        response.writeHead(200, { "content-type": MIME["/host.js"]!, "cache-control": "no-store" });
        response.end(hostJs);
        return;
      }
      if (path === "/package.vpk") {
        const bytes = await readFile(vpkPath);
        response.writeHead(200, { "content-type": MIME["/package.vpk"]!, "cache-control": "no-store" });
        response.end(bytes);
        return;
      }
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("not found");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      response.writeHead(500, { "content-type": "text/plain" });
      response.end(message);
    }
  });

  const port = options.port ?? 4390;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  const actualPort = typeof address === "object" && address !== null ? address.port : port;

  return {
    server,
    url: `http://127.0.0.1:${actualPort}/`,
    port: actualPort,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

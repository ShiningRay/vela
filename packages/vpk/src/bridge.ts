/**
 * Console bridge injected into a package document only when the host
 * explicitly opts into debug mode. The script forwards console output and
 * uncaught errors from the sandboxed frame to the parent window via
 * postMessage; the sandbox and CSP semantics stay untouched.
 */
export const BRIDGE_SOURCE = "vela-vpk-bridge";

export type VpkBridgeLevel = "log" | "info" | "warn" | "error";

export interface VpkBridgeMessage {
  source: typeof BRIDGE_SOURCE;
  level: VpkBridgeLevel;
  text: string;
}

export function isVpkBridgeMessage(data: unknown): data is VpkBridgeMessage {
  if (typeof data !== "object" || data === null) return false;
  const value = data as Record<string, unknown>;
  return (
    value.source === BRIDGE_SOURCE &&
    (value.level === "log" || value.level === "info" || value.level === "warn" || value.level === "error") &&
    typeof value.text === "string"
  );
}

/** Raw script body (no <script> wrapper); embedded into the package document. */
export const BRIDGE_SCRIPT = `(function () {
  var SOURCE = ${JSON.stringify(BRIDGE_SOURCE)};
  function format(value) {
    if (typeof value === "string") return value;
    try {
      var json = JSON.stringify(value);
      return json === undefined ? String(value) : json;
    } catch (error) {
      return String(value);
    }
  }
  function send(level, args) {
    try {
      parent.postMessage({ source: SOURCE, level: level, text: Array.prototype.map.call(args, format).join(" ") }, "*");
    } catch (error) {}
  }
  ["log", "info", "warn", "error"].forEach(function (level) {
    var original = console[level];
    console[level] = function () {
      send(level, arguments);
      original.apply(console, arguments);
    };
  });
  window.addEventListener("error", function (event) {
    send("error", [event.message + " (" + (event.filename || "<inline>") + ":" + event.lineno + ":" + event.colno + ")"]);
  });
  window.addEventListener("unhandledrejection", function (event) {
    send("error", ["Unhandled rejection: " + format(event.reason)]);
  });
})();`;

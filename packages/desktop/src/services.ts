import { createSignal } from "solid-js";
import { RemoteSession, WsWire } from "@vela/remote";
import type { Wire, WireMessage } from "@vela/remote";

export interface Task {
  id: string;
  title: string;
  done: boolean;
}

export interface ServiceStatus {
  state: "starting" | "ready";
  connections: number;
  uptimeSec: number;
  pid: number;
}

export const DEFAULT_SERVICE_URL = "ws://127.0.0.1:4317";
const LOG_LIMIT = 200;

/**
 * Stable wire facade. The Tauri supervisor may restart the service on any
 * port; the session registry stays alive while this wrapper swaps transports.
 */
class ServiceWire implements Wire {
  #inner: WsWire | null = null;
  #messageListener: ((message: WireMessage) => void) | null = null;
  #openListener: (() => void) | null = null;
  #closeListener: (() => void) | null = null;
  readonly #url = createSignal(DEFAULT_SERVICE_URL);
  readonly #connected = createSignal(false);

  constructor(url: string) {
    this.connect(url);
  }

  get url(): () => string {
    return this.#url[0];
  }

  get connected(): () => boolean {
    return this.#connected[0];
  }

  connect(url: string): void {
    if (!url) return;
    if (this.#url[0]() === url && this.#inner) return;

    this.#inner?.close();
    this.#url[1](url);
    this.#connected[1](false);

    const inner = new WsWire(url);
    this.#inner = inner;
    inner.onMessage((message) => this.#messageListener?.(message));
    inner.onOpen(() => {
      if (this.#inner !== inner) return;
      this.#connected[1](true);
      this.#openListener?.();
    });
    inner.onClose(() => {
      if (this.#inner !== inner) return;
      this.#connected[1](false);
      this.#closeListener?.();
    });
  }

  send(message: WireMessage): void {
    this.#inner?.send(message);
  }

  onMessage(listener: (message: WireMessage) => void): void {
    this.#messageListener = listener;
  }

  onClose(listener: () => void): void {
    this.#closeListener = listener;
  }

  onOpen(listener: () => void): void {
    this.#openListener = listener;
  }

  close(): void {
    this.#inner?.close();
    this.#inner = null;
    this.#connected[1](false);
  }
}

export const serviceWire = new ServiceWire(DEFAULT_SERVICE_URL);
export const serviceSession = new RemoteSession(serviceWire);
export const serviceUrl = serviceWire.url;
export const serviceConnected = serviceWire.connected;

const [logs, setLogs] = createSignal<string[]>([]);
const [healthy, setHealthy] = createSignal(false);

export const serviceLogs = logs;
export const serviceHealthy = healthy;

export function setServiceUrl(url: string): void {
  if (!url || url === "starting") return;
  serviceWire.connect(url);
}

export function appendServiceLog(line: string): void {
  setLogs((current) => [...current.slice(-(LOG_LIMIT - 1)), line]);
}

export function setServiceLogs(lines: string[]): void {
  setLogs(lines.slice(-LOG_LIMIT));
}

export function setServiceHealthy(value: boolean): void {
  setHealthy(value);
}

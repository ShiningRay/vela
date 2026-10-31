import type { Wire, WireMessage } from "./protocol";

export interface WsWireOptions {
  reconnectDelayMs?: number;
}

/**
 * Browser WebSocket transport. Reconnects with a fixed delay; the session
 * registry survives the reconnect, so the server snapshot patches the same signals.
 */
export class WsWire implements Wire {
  readonly #url: string;
  readonly #reconnectDelayMs: number;
  #socket: WebSocket | null = null;
  #messageListener: ((message: WireMessage) => void) | null = null;
  #closeListener: (() => void) | null = null;
  #openListener: (() => void) | null = null;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  #closed = false;

  constructor(url: string, options: WsWireOptions = {}) {
    this.#url = url;
    this.#reconnectDelayMs = options.reconnectDelayMs ?? 1000;
    this.#connect();
  }

  get connected(): boolean {
    return this.#socket?.readyState === 1;
  }

  send(message: WireMessage): void {
    if (this.#socket?.readyState !== 1) return;
    this.#socket.send(JSON.stringify(message));
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
    this.#closed = true;
    if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = null;
    this.#socket?.close();
    this.#socket = null;
  }

  #connect(): void {
    if (this.#closed) return;

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.#url);
    } catch {
      this.#scheduleReconnect();
      return;
    }

    this.#socket = socket;
    socket.onopen = () => this.#openListener?.();
    socket.onmessage = (event) => {
      try {
        this.#messageListener?.(JSON.parse(String(event.data)) as WireMessage);
      } catch {
        // Ignore malformed frames; the authority is responsible for valid JSON.
      }
    };
    socket.onclose = () => {
      this.#socket = null;
      this.#closeListener?.();
      this.#scheduleReconnect();
    };
    socket.onerror = () => {
      socket.close();
    };
  }

  #scheduleReconnect(): void {
    if (this.#closed || this.#reconnectTimer) return;
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      this.#connect();
    }, this.#reconnectDelayMs);
  }
}

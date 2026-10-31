import type { Wire, WireMessage } from "./protocol";

/**
 * In-memory wire pair for tests and local debugging.
 * Delivery is synchronous on purpose: tests can assert immediately.
 */
export class MemoryWire implements Wire {
  #peer: MemoryWire | null = null;
  #messageListener: ((message: WireMessage) => void) | null = null;
  #closeListener: (() => void) | null = null;
  #closed = false;

  link(peer: MemoryWire): void {
    this.#peer = peer;
    peer.#peer = this;
  }

  send(message: WireMessage): void {
    if (this.#closed) return;
    const peer = this.#peer;
    if (!peer) return;
    peer.#messageListener?.(message);
  }

  onMessage(listener: (message: WireMessage) => void): void {
    this.#messageListener = listener;
  }

  onClose(listener: () => void): void {
    this.#closeListener = listener;
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    const peer = this.#peer;
    this.#peer = null;
    if (peer) peer.#closeListener?.();
  }
}

export function createMemoryWirePair(): [MemoryWire, MemoryWire] {
  const left = new MemoryWire();
  const right = new MemoryWire();
  left.link(right);
  return [left, right];
}

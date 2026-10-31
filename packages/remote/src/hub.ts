import { deepEqual } from "@vela/core/signals";
import type { PatchMessage, ReleaseMessage, Wire, WireMessage } from "./protocol";

/**
 * A platform-neutral readable source. The authority side does not need Solid:
 * a source exposes the current value and notifies subscribers on change.
 */
export interface Source<T> {
  get(): T;
  subscribe(listener: () => void): () => void;
}

export interface WritableSource<T> extends Source<T> {
  set(value: T): void;
}

export function createSource<T>(initial: T): WritableSource<T> {
  let value = initial;
  const listeners = new Set<() => void>();

  return {
    get: () => value,
    set: (next: T) => {
      if (deepEqual(value, next)) return;
      value = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * Authority-side publisher, ported from Citrine::Remote::Hub.
 *
 * A source is published by subscribing to it: the first emission is the
 * snapshot, every later one is an incremental patch. Batching only groups
 * outbound messages; local state keeps its synchronous semantics.
 */
export class RemoteHub {
  readonly #wire: Wire;
  readonly #publications = new Map<string, () => void>();
  readonly #batchMessages: WireMessage[] = [];
  #batchDepth = 0;
  #batchId: string | undefined;
  #nextBatchId = 0;

  constructor(wire: Wire) {
    this.#wire = wire;
  }

  publish<T>(key: string, source: Source<T>): void {
    this.watch(key, source);
  }

  watch<T>(key: string, source: Source<T>): void {
    this.unwatch(key, false);
    const unsubscribe = source.subscribe(() => {
      this.#emit({ kind: "patch", key, value: source.get() });
    });
    this.#publications.set(key, unsubscribe);
    this.#emit({ kind: "patch", key, value: source.get() });
  }

  unwatch(key: string, release = true): void {
    const unsubscribe = this.#publications.get(key);
    if (!unsubscribe) return;
    unsubscribe();
    this.#publications.delete(key);
    if (release) this.#emit({ kind: "release", key });
  }

  /**
   * Group patches into one atomic remote frame. The authority-side `batch`
   * tags messages and terminates the group with a barrier.
   */
  batch(fn: () => void, batchId?: string): void {
    this.#batchDepth += 1;
    this.#batchId ??= batchId ?? `hub-${Date.now()}-${++this.#nextBatchId}`;
    try {
      fn();
    } finally {
      this.#batchDepth -= 1;
      if (this.#batchDepth === 0) this.#flush();
    }
  }

  dispose(): void {
    for (const key of [...this.#publications.keys()]) {
      this.unwatch(key, true);
    }
  }

  #emit(message: PatchMessage | ReleaseMessage): void {
    if (this.#batchDepth > 0) {
      this.#batchMessages.push({ ...message, batch_id: this.#batchId });
      return;
    }
    this.#send(message);
  }

  #flush(): void {
    const messages = this.#batchMessages.splice(0);
    const batchId = this.#batchId;
    this.#batchId = undefined;
    if (messages.length === 0 || !batchId) return;

    for (const message of messages) this.#send(message);
    this.#send({ kind: "barrier", batch_id: batchId });
  }

  #send(message: WireMessage): void {
    try {
      this.#wire.send(message);
    } catch {
      // A dead transport is not allowed to break the authority's signal graph.
      // The connection owner is responsible for reconnecting and re-publishing.
    }
  }
}

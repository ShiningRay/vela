import { batch, createSignal } from "solid-js";
import { deepEqual } from "@vela/core/signals";
import type { Wire, WireMessage } from "./protocol";

export interface RemoteSignal<T> {
  /** Solid-style read: the mirrored value, or undefined after a release. */
  (): T | undefined;
  key: string;
  get(): T | undefined;
  set(value: T): void;
}

interface Entry<T> {
  get: () => T | undefined;
  set: (value: T | undefined) => void;
}

/**
 * Client-side mirror, ported from Citrine::Remote::Session.
 *
 * - One signal instance per key; the registry survives reconnects.
 * - `propose` writes locally first, then asks the authority to confirm.
 * - `patch` applies without sending anything back (echo suppression).
 * - Barriers commit a batch inside Solid's `batch`, so related keys land in one frame.
 */
export class RemoteSession {
  readonly #wire: Wire;
  readonly #registry = new Map<string, Entry<unknown>>();
  readonly #pendingBatches = new Map<string, WireMessage[]>();

  /** Called before each patch is applied; useful for source highlighting. */
  onPatch: ((key: string) => void) | null = null;

  constructor(wire: Wire) {
    this.#wire = wire;
    wire.onMessage((message) => this.dispatch(message));
  }

  signal<T>(key: string, initial: T): RemoteSignal<T> {
    const existing = this.#registry.get(key) as Entry<T> | undefined;
    const entry = existing ?? this.#createEntry(key, initial);
    const read = (() => entry.get()) as RemoteSignal<T>;
    read.key = key;
    read.get = () => entry.get();
    read.set = (value: T) => {
      entry.set(value);
      this.#wire.send({ kind: "propose", key, value });
    };
    return read;
  }

  dispatch(message: WireMessage): void {
    if (message.kind === "patch" || message.kind === "release") {
      if (message.batch_id) {
        const pending = this.#pendingBatches.get(message.batch_id) ?? [];
        pending.push(message);
        this.#pendingBatches.set(message.batch_id, pending);
        return;
      }
      this.#apply(message);
      return;
    }

    if (message.kind === "barrier") {
      const pending = this.#pendingBatches.get(message.batch_id);
      this.#pendingBatches.delete(message.batch_id);
      if (!pending || pending.length === 0) return;
      batch(() => {
        for (const item of pending) this.#apply(item);
      });
    }
  }

  #apply(message: WireMessage): void {
    if (message.kind === "patch") {
      this.onPatch?.(message.key);
      const entry = this.#registry.get(message.key) ?? this.#createEntry(message.key, message.value);
      entry.set(message.value);
      return;
    }

    if (message.kind === "release") {
      const entry = this.#registry.get(message.key);
      if (!entry) return;
      entry.set(undefined);
      this.#registry.delete(message.key);
    }
  }

  #createEntry<T>(key: string, initial: T): Entry<T> {
    const [get, set] = createSignal<T | undefined>(initial, { equals: deepEqual });
    const entry: Entry<T> = { get, set };
    this.#registry.set(key, entry as Entry<unknown>);
    return entry;
  }
}

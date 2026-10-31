import { createSignal } from "solid-js";

export interface Notification {
  id: number;
  title: string;
  body?: string;
  createdAt: number;
}

export interface NotificationOptions {
  /** Milliseconds before auto-dismiss; 0 keeps the notification pinned. */
  timeoutMs?: number;
}

export interface NotificationCenterOptions {
  defaultTimeoutMs?: number;
  /** Called for every accepted notification; used to bridge to OS notifications. */
  onPush?: (notification: Notification) => void;
}

type Signal<T> = readonly [
  () => T,
  (value: T | ((prev: T) => T)) => T,
];

export const DEFAULT_NOTIFICATION_TIMEOUT = 6_000;

export class NotificationCenter {
  readonly #items: Signal<Notification[]>;
  readonly #timers = new Map<number, ReturnType<typeof setTimeout>>();
  readonly #defaultTimeoutMs: number;
  readonly #onPush: ((notification: Notification) => void) | undefined;
  #nextId = 1;

  constructor(options: NotificationCenterOptions = {}) {
    this.#items = createSignal<Notification[]>([]);
    this.#defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_NOTIFICATION_TIMEOUT;
    this.#onPush = options.onPush;
  }

  get items(): Notification[] {
    return this.#items[0]();
  }

  push(title: string, body?: string, options: NotificationOptions = {}): Notification {
    const notification: Notification = {
      id: this.#nextId,
      title,
      body,
      createdAt: Date.now(),
    };
    this.#nextId += 1;
    this.#items[1]((items) => [...items, notification]);

    try {
      this.#onPush?.(notification);
    } catch {
      // A host notification bridge must not break the in-app notification list.
    }

    const timeout = options.timeoutMs ?? this.#defaultTimeoutMs;
    if (timeout > 0) {
      const timer = setTimeout(() => this.dismiss(notification.id), timeout);
      // Node keeps the process alive for pending timers; a notification is not
      // a reason to pin the runtime open.
      (timer as unknown as { unref?: () => void }).unref?.();
      this.#timers.set(notification.id, timer);
    }

    return notification;
  }

  dismiss(id: number): void {
    const timer = this.#timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.#timers.delete(id);
    }
    this.#items[1]((items) => items.filter((item) => item.id !== id));
  }

  clear(): void {
    for (const timer of this.#timers.values()) clearTimeout(timer);
    this.#timers.clear();
    this.#items[1]([]);
  }

  dispose(): void {
    this.clear();
  }
}

import { createSignal } from "solid-js";

export interface Notification {
  id: number;
  title: string;
  body?: string;
  createdAt: number;
}

type Signal<T> = readonly [
  () => T,
  (value: T | ((prev: T) => T)) => T,
];

export class NotificationCenter {
  readonly #items: Signal<Notification[]>;
  #nextId = 1;

  constructor() {
    this.#items = createSignal<Notification[]>([]);
  }

  get items(): Notification[] {
    return this.#items[0]();
  }

  push(title: string, body?: string): Notification {
    const notification: Notification = {
      id: this.#nextId,
      title,
      body,
      createdAt: Date.now(),
    };
    this.#nextId += 1;
    this.#items[1]((items) => [...items, notification]);
    return notification;
  }

  dismiss(id: number): void {
    this.#items[1]((items) => items.filter((item) => item.id !== id));
  }

  clear(): void {
    this.#items[1]([]);
  }
}

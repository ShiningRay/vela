import { createSignal } from "solid-js";
import type { Component } from "solid-js";

export interface AppDefinition {
  id: string;
  title: string;
  icon: string;
  component: Component;
  singleton?: boolean;
}

type Signal<T> = readonly [
  () => T,
  (value: T | ((prev: T) => T)) => T,
];

/**
 * Application registry, borrowed from Emerald's AppRegistry.
 * The desktop shell reads `apps()` and renders icons; installing or removing an
 * app is a signal write, so only the icon grid updates.
 */
export class AppRegistry {
  readonly #apps: Signal<AppDefinition[]>;

  constructor(initial: AppDefinition[] = []) {
    this.#apps = createSignal<AppDefinition[]>(initial);
  }

  get apps(): AppDefinition[] {
    return this.#apps[0]();
  }

  register(app: AppDefinition): void {
    if (this.find(app.id)) {
      throw new Error(`App "${app.id}" is already registered.`);
    }
    this.#apps[1]((apps) => [...apps, app]);
  }

  unregister(id: string): void {
    this.#apps[1]((apps) => apps.filter((app) => app.id !== id));
  }

  find(id: string): AppDefinition | undefined {
    return this.apps.find((app) => app.id === id);
  }
}

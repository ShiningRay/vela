import { createSignal } from "solid-js";

export interface Command {
  id: string;
  title: string;
  run: () => void;
}

type Signal<T> = readonly [
  () => T,
  (value: T | ((prev: T) => T)) => T,
];

export class CommandRegistry {
  readonly #commands: Signal<Command[]>;

  constructor(initial: Command[] = []) {
    this.#commands = createSignal<Command[]>(initial);
  }

  get commands(): Command[] {
    return this.#commands[0]();
  }

  register(command: Command): void {
    if (this.find(command.id)) {
      throw new Error(`Command "${command.id}" is already registered.`);
    }
    this.#commands[1]((commands) => [...commands, command]);
  }

  unregister(id: string): void {
    this.#commands[1]((commands) => commands.filter((command) => command.id !== id));
  }

  find(id: string): Command | undefined {
    return this.commands.find((command) => command.id === id);
  }

  run(id: string): void {
    const command = this.find(id);
    if (!command) {
      throw new Error(`Unknown command "${id}".`);
    }
    command.run();
  }
}

import { createDeepSignal, deepEqual } from "./signals";
import type { Vfs } from "./vfs";

export type ConfigScopeId = "system" | `apps/${string}`;

export type ConfigErrorCode =
  | "invalid_scope"
  | "invalid_config"
  | "invalid_value"
  | "migration_failed"
  | "scope_defined"
  | "write_failed";

export class ConfigError extends Error {
  readonly code: ConfigErrorCode;

  constructor(code: ConfigErrorCode, message: string) {
    super(message);
    this.name = "ConfigError";
    this.code = code;
  }
}

export interface ConfigSchema<T extends object> {
  /** Current on-disk version. Older files run `migrate` before validation. */
  version: number;
  defaults: T;
  /**
   * Validate known fields and return the value to persist. Custom validators
   * must retain unknown fields so a newer writer cannot lose data.
   */
  validate?: (value: Record<string, unknown>) => T;
  migrate?: (value: Record<string, unknown>, fromVersion: number, toVersion: number) => Record<string, unknown>;
}

export interface ConfigScope<T extends object> {
  readonly id: ConfigScopeId;
  readonly path: string;
  get(): T;
  set(patch: Partial<T>): T;
  reset(): T;
  subscribe(listener: (value: T) => void): () => void;
  exists(): boolean;
  flush(): Promise<void>;
  lastError(): ConfigError | null;
}

interface ConfigEnvelope {
  version: number;
  values: Record<string, unknown>;
}

const APP_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,31}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => cloneValue(item)) as T;
  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) result[key] = cloneValue(item);
    return result as T;
  }
  return value;
}

function mergeUnknown(base: unknown, patch: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(patch)) return cloneValue(patch);
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(base)) result[key] = cloneValue(item);
  for (const [key, item] of Object.entries(patch)) {
    if (item === undefined) continue;
    const current = result[key];
    result[key] = isPlainObject(current) && isPlainObject(item)
      ? mergeUnknown(current, item)
      : cloneValue(item);
  }
  return result;
}

function mergeRecords(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  return mergeUnknown(base, patch) as Record<string, unknown>;
}

function assertAppId(appId: string): string {
  if (appId === "system" || !APP_ID_PATTERN.test(appId)) {
    throw new ConfigError(
      "invalid_scope",
      `Invalid app scope "${appId}". Use 2-32 lowercase letters, digits or hyphens; "system" is reserved.`,
    );
  }
  return appId;
}

class ConfigScopeImpl<T extends object> implements ConfigScope<T> {
  readonly id: ConfigScopeId;
  readonly path: string;
  readonly schema: ConfigSchema<T>;
  readonly #vfs: Vfs;
  readonly #signal: readonly [() => T, (value: T | ((prev: T) => T)) => T];
  readonly #listeners = new Set<(value: T) => void>();
  #loaded = false;
  #error: ConfigError | null = null;

  constructor(id: ConfigScopeId, path: string, vfs: Vfs, schema: ConfigSchema<T>) {
    this.id = id;
    this.path = path;
    this.schema = schema;
    this.#vfs = vfs;
    this.#signal = createDeepSignal<T>(cloneValue(schema.defaults));
  }

  get(): T {
    this.#load();
    return cloneValue(this.#signal[0]());
  }

  set(patch: Partial<T>): T {
    this.#load();
    const current = this.#signal[0]();
    const merged = mergeRecords(
      current as Record<string, unknown>,
      patch as Record<string, unknown>,
    );
    const validated = this.#validate(merged);
    if (deepEqual(current, validated)) return cloneValue(current);
    this.#persist(validated);
    this.#commit(validated);
    return cloneValue(validated);
  }

  reset(): T {
    this.#load();
    const next = this.#validate(
      mergeRecords({}, this.schema.defaults as Record<string, unknown>),
    );
    this.#persist(next);
    this.#commit(next);
    return cloneValue(next);
  }

  subscribe(listener: (value: T) => void): () => void {
    this.#load();
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  exists(): boolean {
    try {
      this.#vfs.read(this.path);
      return true;
    } catch {
      return false;
    }
  }

  flush(): Promise<void> {
    return this.#vfs.flush?.() ?? Promise.resolve();
  }

  lastError(): ConfigError | null {
    return this.#error;
  }

  #load(): void {
    if (this.#loaded) return;
    this.#loaded = true;
    this.#error = null;

    let raw: string;
    try {
      raw = this.#vfs.read(this.path);
    } catch {
      // Missing file is normal: defaults are returned without creating one.
      this.#signal[1](cloneValue(this.schema.defaults));
      return;
    }

    let envelope: ConfigEnvelope;
    try {
      envelope = this.#parseEnvelope(raw);
    } catch (error) {
      this.#error = new ConfigError(
        "invalid_config",
        `Config "${this.path}" is not a valid config file: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.#signal[1](cloneValue(this.schema.defaults));
      return;
    }

    let values = mergeRecords(
      this.schema.defaults as Record<string, unknown>,
      envelope.values,
    );

    if (envelope.version < this.schema.version) {
      if (!this.schema.migrate) {
        this.#error = new ConfigError(
          "migration_failed",
          `Config "${this.path}" is version ${envelope.version}, but no migration to ${this.schema.version} is registered.`,
        );
        this.#signal[1](cloneValue(this.schema.defaults));
        return;
      }
      try {
        const migrated = this.schema.migrate(
          cloneValue(envelope.values),
          envelope.version,
          this.schema.version,
        );
        values = mergeRecords(this.schema.defaults as Record<string, unknown>, migrated);
        const validated = this.#validate(values);
        this.#write(validated);
        this.#signal[1](validated);
        return;
      } catch (error) {
        this.#error = new ConfigError(
          "migration_failed",
          `Config "${this.path}" migration failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        this.#signal[1](cloneValue(this.schema.defaults));
        return;
      }
    }

    try {
      const validated = this.#validate(values);
      this.#signal[1](validated);
    } catch (error) {
      this.#error = error instanceof ConfigError
        ? error
        : new ConfigError("invalid_value", `Config "${this.path}" is invalid: ${error instanceof Error ? error.message : String(error)}`);
      this.#signal[1](cloneValue(this.schema.defaults));
    }
  }

  #parseEnvelope(raw: string): ConfigEnvelope {
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainObject(parsed)) throw new Error("expected an object");
    if (typeof parsed.version !== "number" || !Number.isInteger(parsed.version) || parsed.version < 1) {
      throw new Error("version must be a positive integer");
    }
    if (!isPlainObject(parsed.values)) throw new Error("values must be an object");
    return { version: parsed.version, values: parsed.values };
  }

  #validate(values: Record<string, unknown>): T {
    if (!this.schema.validate) return values as T;
    return this.schema.validate(cloneValue(values));
  }

  #persist(values: T): void {
    this.#write(values);
  }

  #write(values: T): void {
    const envelope: ConfigEnvelope = {
      version: this.schema.version,
      values: values as Record<string, unknown>,
    };
    try {
      this.#vfs.write(this.path, JSON.stringify(envelope, null, 2));
    } catch (error) {
      throw new ConfigError(
        "write_failed",
        `Failed to write config "${this.path}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  #commit(values: T): void {
    this.#error = null;
    this.#signal[1](values);
    for (const listener of [...this.#listeners]) {
      try {
        listener(cloneValue(values));
      } catch (error) {
        // A failing subscriber must not roll back or block the persisted write.
        console.error(`Config subscriber for "${this.id}" failed`, error);
      }
    }
  }
}

/**
 * Scoped configuration facade over the shared VFS.
 *
 * `system` is the desktop settings namespace; `app(id)` is the only namespace
 * handed to an internal app. VPK code never receives this object.
 */
export class ConfigStore {
  readonly #vfs: Vfs;
  readonly #scopes = new Map<string, ConfigScopeImpl<object>>();

  constructor(vfs: Vfs) {
    this.#vfs = vfs;
  }

  system<T extends object>(schema: ConfigSchema<T>): ConfigScope<T> {
    return this.#scope("system", "/Config/system.json", schema);
  }

  app<T extends object>(appId: string, schema: ConfigSchema<T>): ConfigScope<T> {
    const id = assertAppId(appId);
    return this.#scope(`apps/${id}`, `/Config/apps/${id}.json`, schema);
  }

  #scope<T extends object>(id: ConfigScopeId, path: string, schema: ConfigSchema<T>): ConfigScope<T> {
    const existing = this.#scopes.get(id);
    if (existing) {
      if (existing.schema !== schema) {
        throw new ConfigError(
          "scope_defined",
          `Config scope "${id}" is already defined with a different schema.`,
        );
      }
      return existing as unknown as ConfigScope<T>;
    }
    const scope = new ConfigScopeImpl(id, path, this.#vfs, schema as ConfigSchema<object>);
    this.#scopes.set(id, scope);
    return scope as unknown as ConfigScope<T>;
  }
}

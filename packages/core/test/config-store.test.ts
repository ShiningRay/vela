import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { ConfigError, ConfigStore } from "../src/config-store";
import type { ConfigSchema } from "../src/config-store";
import { IndexedDbVfs } from "../src/indexeddb-vfs";
import { MemoryVfs } from "../src/vfs";

interface DemoConfig {
  accent: string;
  nested: { a: number; b: number };
}

const DEFAULTS: DemoConfig = {
  accent: "blue",
  nested: { a: 1, b: 2 },
};

function demoSchema(overrides: Partial<ConfigSchema<DemoConfig>> = {}): ConfigSchema<DemoConfig> {
  return {
    version: 1,
    defaults: DEFAULTS,
    validate: (value) => {
      if (typeof value.accent !== "string") {
        throw new ConfigError("invalid_value", "accent must be a string");
      }
      if (
        typeof value.nested !== "object" ||
        value.nested === null ||
        typeof (value.nested as Record<string, unknown>).a !== "number" ||
        typeof (value.nested as Record<string, unknown>).b !== "number"
      ) {
        throw new ConfigError("invalid_value", "nested must contain numeric a and b");
      }
      return value as unknown as DemoConfig;
    },
    ...overrides,
  };
}

function readEnvelope(vfs: MemoryVfs, path: string): { version: number; values: Record<string, unknown> } {
  return JSON.parse(vfs.read(path)) as { version: number; values: Record<string, unknown> };
}

describe("ConfigStore", () => {
  it("isolates system and app scopes", () => {
    const vfs = new MemoryVfs();
    const store = new ConfigStore(vfs);
    const system = store.system(demoSchema());
    const appA = store.app("app-a", demoSchema());
    const appB = store.app("app-b", demoSchema());

    system.set({ accent: "red" });
    appA.set({ accent: "green" });
    appB.set({ accent: "yellow" });

    expect(system.get().accent).toBe("red");
    expect(appA.get().accent).toBe("green");
    expect(appB.get().accent).toBe("yellow");
    expect(vfs.read("/Config/system.json")).toContain('"red"');
    expect(vfs.read("/Config/apps/app-a.json")).toContain('"green"');
    expect(vfs.read("/Config/apps/app-b.json")).toContain('"yellow"');
  });

  it("exposes no cross-scope entry point on a scope handle", () => {
    const store = new ConfigStore(new MemoryVfs());
    const appScope = store.app("app-a", demoSchema());
    const systemScope = store.system(demoSchema());
    expect(appScope).not.toHaveProperty("app");
    expect(appScope).not.toHaveProperty("system");
    expect(systemScope).not.toHaveProperty("app");
    expect(systemScope.id).toBe("system");
    expect(appScope.id).toBe("apps/app-a");
  });

  it("rejects invalid app scope ids without writing files", () => {
    const vfs = new MemoryVfs();
    const store = new ConfigStore(vfs);
    for (const id of ["system", "", "a/b", "../evil", "a\\b", "A"]) {
      expect(() => store.app(id, demoSchema())).toThrowError(ConfigError);
      try {
        store.app(id, demoSchema());
      } catch (error) {
        expect((error as ConfigError).code).toBe("invalid_scope");
      }
    }
    expect(vfs.list("/").some((entry) => entry.name === "Config")).toBe(false);
  });

  it("returns defaults without creating a file when the scope is missing", () => {
    const vfs = new MemoryVfs();
    const scope = new ConfigStore(vfs).system(demoSchema());
    expect(scope.exists()).toBe(false);
    expect(scope.get()).toEqual(DEFAULTS);
    expect(scope.exists()).toBe(false);
  });

  it("falls back to defaults on a corrupt file without overwriting it", () => {
    const vfs = new MemoryVfs();
    vfs.write("/Config/system.json", "{not json");
    const scope = new ConfigStore(vfs).system(demoSchema());
    expect(scope.get()).toEqual(DEFAULTS);
    expect(scope.lastError()?.code).toBe("invalid_config");
    expect(vfs.read("/Config/system.json")).toBe("{not json");
  });

  it("merges defaults and preserves unknown fields across writes", () => {
    const vfs = new MemoryVfs();
    vfs.write(
      "/Config/system.json",
      JSON.stringify({
        version: 1,
        values: { accent: "red", future: { flag: true } },
      }),
    );
    const scope = new ConfigStore(vfs).system(demoSchema());

    expect(scope.get().nested).toEqual(DEFAULTS.nested);
    scope.set({ accent: "green" });
    const stored = readEnvelope(vfs, "/Config/system.json");
    expect(stored.values.future).toEqual({ flag: true });
    expect(stored.values.nested).toEqual(DEFAULTS.nested);
  });

  it("rejects invalid values and keeps memory and disk unchanged", () => {
    const vfs = new MemoryVfs();
    const scope = new ConfigStore(vfs).system(demoSchema());
    scope.set({ accent: "red" });
    const before = vfs.read("/Config/system.json");

    expect(() => scope.set({ accent: 42 as unknown as string })).toThrowError(ConfigError);
    try {
      scope.set({ accent: 42 as unknown as string });
    } catch (error) {
      expect((error as ConfigError).code).toBe("invalid_value");
    }
    expect(scope.get().accent).toBe("red");
    expect(vfs.read("/Config/system.json")).toBe(before);
  });

  it("migrates an old version, writes the new version and stays idempotent", () => {
    const vfs = new MemoryVfs();
    vfs.write(
      "/Config/system.json",
      JSON.stringify({ version: 1, values: { accent: "red" } }),
    );
    const migrate = vi.fn((value: Record<string, unknown>, from: number, to: number) => ({
      ...value,
      accent: `${String(value.accent)}-v${to}`,
      migratedFrom: from,
    }));
    const schema = demoSchema({ version: 2, migrate });
    const scope = new ConfigStore(vfs).system(schema);

    expect(scope.get().accent).toBe("red-v2");
    expect(readEnvelope(vfs, "/Config/system.json").version).toBe(2);
    expect(migrate).toHaveBeenCalledTimes(1);

    const second = new ConfigStore(vfs).system(demoSchema({ version: 2, migrate }));
    expect(second.get().accent).toBe("red-v2");
    expect(migrate).toHaveBeenCalledTimes(1);
  });

  it("keeps the old file and falls back to defaults when migration fails", () => {
    const vfs = new MemoryVfs();
    const raw = JSON.stringify({ version: 1, values: { accent: "red" } });
    vfs.write("/Config/system.json", raw);
    const schema = demoSchema({
      version: 2,
      migrate: () => {
        throw new Error("boom");
      },
    });
    const scope = new ConfigStore(vfs).system(schema);

    expect(scope.get()).toEqual(DEFAULTS);
    expect(scope.lastError()?.code).toBe("migration_failed");
    expect(vfs.read("/Config/system.json")).toBe(raw);
  });

  it("notifies subscribers once per change and stops after unsubscribe", () => {
    const vfs = new MemoryVfs();
    const scope = new ConfigStore(vfs).system(demoSchema());
    const listener = vi.fn();
    const unsubscribe = scope.subscribe(listener);

    scope.set({ accent: "red" });
    scope.set({ accent: "red" });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    scope.set({ accent: "green" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("resets the scope to defaults, persists and notifies", () => {
    const vfs = new MemoryVfs();
    const scope = new ConfigStore(vfs).system(demoSchema());
    scope.set({ accent: "red" });
    const listener = vi.fn();
    scope.subscribe(listener);

    expect(scope.reset()).toEqual(DEFAULTS);
    expect(scope.get()).toEqual(DEFAULTS);
    expect(readEnvelope(vfs, "/Config/system.json").values).toEqual(DEFAULTS);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("persists across IndexedDbVfs instances and exposes a flush barrier", async () => {
    const name = `vela-config-test-${crypto.randomUUID()}`;
    const vfs = await IndexedDbVfs.open({ databaseName: name });
    const scope = new ConfigStore(vfs).system(demoSchema());
    scope.set({ accent: "red" });
    await expect(scope.flush()).resolves.toBeUndefined();
    vfs.close();

    const second = await IndexedDbVfs.open({ databaseName: name });
    expect(new ConfigStore(second).system(demoSchema()).get().accent).toBe("red");
    second.close();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
});

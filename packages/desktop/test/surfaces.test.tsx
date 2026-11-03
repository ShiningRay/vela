// @vitest-environment happy-dom
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@solidjs/testing-library";
import { AppRegistry, MemoryVfs, NotificationCenter, SurfaceRegistry } from "@vela/core";
import { readPersistedSurfaces, SurfaceLayer, SURFACES_KEY } from "../src/surfaces";
import type { RemoteSession, RemoteSignal } from "@vela/remote";
import type { SurfaceRecord } from "@vela/core";

function chartRecord(overrides: Partial<SurfaceRecord> = {}): SurfaceRecord {
  return {
    id: "kpi-1",
    owner: "agent.demo",
    kind: "widget",
    title: "Revenue",
    geometry: { x: 10, y: 10, width: 320, height: 200 },
    content: {
      type: "chart",
      spec: { kind: "kpi", encoding: { value: "revenue" }, decimals: 1 },
      dataKey: "daily",
    },
    persist: false,
    createdAt: 1,
    ...overrides,
  } as SurfaceRecord;
}

describe("SurfaceLayer persistence", () => {
  afterEach(() => vi.useRealTimers());

  it("writes persist:true surfaces to /Surfaces and removes records on delete", async () => {
    const vfs = new MemoryVfs();
    const surfaces = new SurfaceRegistry();
    const { unmount } = render(() => (
      <SurfaceLayer
        surfaces={surfaces}
        apps={new AppRegistry()}
        session={null}
        vfs={vfs}
        notifications={new NotificationCenter()}
      />
    ));

    surfaces.create({
      id: "persisted",
      owner: "agent.demo",
      kind: "widget",
      geometry: { x: 0, y: 0, width: 200, height: 120 },
      content: { type: "static", title: "t", body: "b" },
      persist: true,
    });
    await Promise.resolve();
    expect(vfs.read("/Surfaces/persisted.json")).toContain('"id":"persisted"');
    expect(readPersistedSurfaces(vfs)).toHaveLength(1);

    surfaces.destroy("persisted");
    await Promise.resolve();
    expect(() => vfs.read("/Surfaces/persisted.json")).toThrow();
    expect(readPersistedSurfaces(vfs)).toHaveLength(0);
    unmount();
  });

  it("never persists ttl surfaces or transient ones", async () => {
    const vfs = new MemoryVfs();
    const surfaces = new SurfaceRegistry();
    const { unmount } = render(() => (
      <SurfaceLayer
        surfaces={surfaces}
        apps={new AppRegistry()}
        session={null}
        vfs={vfs}
        notifications={new NotificationCenter()}
      />
    ));
    surfaces.create({
      id: "ttl",
      owner: "agent.demo",
      kind: "widget",
      geometry: { x: 0, y: 0, width: 200, height: 120 },
      content: { type: "static", title: "t", body: "b" },
      ttlSeconds: 30,
    });
    surfaces.create({
      id: "transient",
      owner: "agent.demo",
      kind: "widget",
      geometry: { x: 0, y: 0, width: 200, height: 120 },
      content: { type: "static", title: "t", body: "b" },
    });
    await Promise.resolve();
    expect(() => vfs.read("/Surfaces/ttl.json")).toThrow();
    expect(() => vfs.read("/Surfaces/transient.json")).toThrow();
    unmount();
  });

  it("replays persisted surfaces on mount with a waiting chart placeholder", async () => {
    const vfs = new MemoryVfs();
    vfs.mkdir("/Surfaces");
    vfs.write(
      "/Surfaces/kpi-1.json",
      JSON.stringify({ surface: chartRecord({ persist: true }), savedAt: 1 }),
    );
    const surfaces = new SurfaceRegistry();
    const { container, unmount } = render(() => (
      <SurfaceLayer
        surfaces={surfaces}
        apps={new AppRegistry()}
        session={null}
        vfs={vfs}
        notifications={new NotificationCenter()}
      />
    ));
    await Promise.resolve();
    const widget = container.querySelector('[data-window-id="kpi-1"]');
    expect(widget).not.toBeNull();
    expect(widget!.getAttribute("data-window-kind")).toBe("widget");
    expect(widget!.getAttribute("data-decorated")).toBe("false");
    expect(widget!.querySelector('[data-waiting="true"]')).not.toBeNull();
    expect(container.querySelector(".vela-taskbar")).toBeNull();
    unmount();
  });

  it("ttl surfaces disappear when the registry sweep expires them", () => {
    vi.useFakeTimers();
    const vfs = new MemoryVfs();
    const surfaces = new SurfaceRegistry({ autoSweepMs: 1_000 });
    const { container, unmount } = render(() => (
      <SurfaceLayer
        surfaces={surfaces}
        apps={new AppRegistry()}
        session={null}
        vfs={vfs}
        notifications={new NotificationCenter()}
      />
    ));
    surfaces.create({
      id: "flash",
      owner: "agent.demo",
      kind: "widget",
      geometry: { x: 0, y: 0, width: 200, height: 120 },
      content: { type: "static", title: "t", body: "b" },
      ttlSeconds: 5,
    });
    expect(container.querySelector('[data-window-id="flash"]')).not.toBeNull();
    vi.advanceTimersByTime(6_000);
    expect(container.querySelector('[data-window-id="flash"]')).toBeNull();
    surfaces.stopAutoSweep();
    unmount();
  });
});

describe("SurfaceLayer service mirror", () => {
  function fakeSession() {
    const registry = new Map<string, { read: () => unknown; write: (value: unknown) => void }>();
    const session = {
      signal<T>(key: string, initial: T) {
        if (!registry.has(key)) {
          const [get, set] = createSignal<T>(initial, { equals: false });
          registry.set(key, {
            read: get as unknown as () => unknown,
            write: set as unknown as (value: unknown) => void,
          });
        }
        const entry = registry.get(key)!;
        const read = (() => entry.read()) as unknown as RemoteSignal<T>;
        return Object.assign(read, {
          key,
          get: () => entry.read() as T,
          set: (value: T) => entry.write(value),
        });
      },
      // Test hook: simulate an authority patch arriving for a key.
      __emit(key: string, value: unknown) {
        registry.get(key)?.write(value);
      },
    } as unknown as RemoteSession & { __emit: (key: string, value: unknown) => void };
    return session;
  }

  it("mirrors the authority surface list without dropping replayed surfaces", async () => {
    const vfs = new MemoryVfs();
    const surfaces = new SurfaceRegistry();
    surfaces.replay([chartRecord({ id: "replayed", persist: true })]);
    const session = fakeSession();
    const { container, unmount } = render(() => (
      <SurfaceLayer surfaces={surfaces} apps={new AppRegistry()} session={session} vfs={vfs} notifications={new NotificationCenter()} />
    ));

    session.__emit(SURFACES_KEY, [chartRecord({ id: "live" })]);
    await Promise.resolve();
    expect(container.querySelectorAll(".vela-surface-layer .vela-window")).toHaveLength(2);

    // The authority does not know the replayed surface (fresh service start):
    // the mirror removes its own ids but keeps replayed ones alive.
    session.__emit(SURFACES_KEY, []);
    await Promise.resolve();
    expect(container.querySelectorAll(".vela-surface-layer .vela-window")).toHaveLength(1);
    expect(surfaces.has("replayed")).toBe(true);
    expect(surfaces.has("live")).toBe(false);

    // Once the authority reports the surface it takes ownership of it.
    session.__emit(SURFACES_KEY, [chartRecord({ id: "replayed" })]);
    await Promise.resolve();
    session.__emit(SURFACES_KEY, []);
    await Promise.resolve();
    expect(container.querySelectorAll(".vela-surface-layer .vela-window")).toHaveLength(0);
    expect(surfaces.has("replayed")).toBe(false);
    unmount();
  });

  it("feeds chart data into the waiting placeholder through the data key", async () => {
    const vfs = new MemoryVfs();
    const surfaces = new SurfaceRegistry();
    surfaces.create({
      id: "kpi-live",
      owner: "agent.demo",
      kind: "widget",
      geometry: { x: 0, y: 0, width: 200, height: 120 },
      content: { type: "chart", spec: { kind: "kpi", encoding: { value: "revenue" } }, dataKey: "daily" },
    });
    const session = fakeSession();
    const { container, unmount } = render(() => (
      <SurfaceLayer surfaces={surfaces} apps={new AppRegistry()} session={session} vfs={vfs} notifications={new NotificationCenter()} />
    ));

    expect(container.querySelector('[data-window-id="kpi-live"] [data-waiting="true"]')).not.toBeNull();
    session.__emit("agent.demo.data.daily", [{ revenue: 42.5 }]);
    await Promise.resolve();
    const value = container.querySelector('[data-window-id="kpi-live"] .vela-chart__kpi-value');
    expect(value).not.toBeNull();
    expect(value!.textContent).toBe("43");
    unmount();
  });

  it("expires ttl surfaces mirrored from the authority (mirror must not resurrect them)", () => {
    vi.useFakeTimers();
    const vfs = new MemoryVfs();
    const surfaces = new SurfaceRegistry({ autoSweepMs: 1_000 });
    const session = fakeSession();
    const { container, unmount } = render(() => (
      <SurfaceLayer surfaces={surfaces} apps={new AppRegistry()} session={session} vfs={vfs} notifications={new NotificationCenter()} />
    ));

    session.__emit(SURFACES_KEY, [
      chartRecord({ id: "flash", ttlSeconds: 3, expiresAt: Date.now() + 3_000 }),
    ]);
    expect(container.querySelector('[data-window-id="flash"]')).not.toBeNull();

    vi.advanceTimersByTime(6_000);
    expect(container.querySelector('[data-window-id="flash"]')).toBeNull();
    surfaces.stopAutoSweep();
    unmount();
  });
});

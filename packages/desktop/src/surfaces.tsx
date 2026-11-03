import { createEffect, createSignal, For, onCleanup, onMount, Show, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import {
  SurfaceRegistry,
  type AppRegistry,
  type ChartRow,
  type NotificationCenter,
  type SurfaceRecord,
  type Vfs,
} from "@vela/core";
import { RemoteSession } from "@vela/remote";
import { Chart, Label, WindowFrame } from "@vela/ui";
import type { SnapZone } from "@vela/core";

/** Well-known signal key that carries the service's authoritative surface table. */
export const SURFACES_KEY = "agent.surfaces";
/** Well-known signal key for the agent file whitelist mirror. */
export const AGENT_DATA_KEY = "agent.agentdata";
/** Well-known signal key carrying notification events for the desktop. */
export const AGENT_NOTIFICATIONS_KEY = "agent.notifications";

export const SURFACE_DIR = "/Surfaces";
export const AGENT_DATA_DIR = "/AgentData";

/** Signal key holding the rows for a chart surface's dataKey. */
export function dataKeyFor(owner: string, dataKey: string): string {
  return `${owner}.data.${dataKey}`;
}

interface SurfaceRecordFile {
  surface: SurfaceRecord;
  savedAt: number;
}

export interface SurfaceLayerProps {
  surfaces: SurfaceRegistry;
  apps: AppRegistry;
  session: RemoteSession | null;
  vfs: Vfs;
  notifications: NotificationCenter;
}

/**
 * Renders every registered surface: undecorated widgets and panels float in
 * their own layer below normal windows; `window` surfaces get chrome and can
 * be minimized, maximized and closed. Also owns the three shell-side bridges:
 * VFS persistence and replay, the service mirror, and notification events.
 */
export function SurfaceLayer(props: SurfaceLayerProps): JSX.Element {
  const [order, setOrder] = createSignal<string[]>([]);
  const [windowState, setWindowState] = createSignal<Map<string, { minimized: boolean; maximized: boolean; restore: SurfaceRecord["geometry"] }>>(new Map());

  const focus = (id: string): void => {
    setOrder((current) => [...current.filter((value) => value !== id), id]);
  };

  const zIndex = (id: string): number => {
    const index = order().indexOf(id);
    return index === -1 ? 0 : index + 1;
  };

  const stateFor = (record: SurfaceRecord) => {
    return (
      windowState().get(record.id) ?? { minimized: false, maximized: false, restore: record.geometry }
    );
  };

  const updateState = (id: string, patch: Partial<{ minimized: boolean; maximized: boolean; restore: SurfaceRecord["geometry"] }>): void => {
    setWindowState((current) => {
      const next = new Map(current);
      const existing = next.get(id) ?? { minimized: false, maximized: false, restore: props.surfaces.get(id)?.geometry ?? { x: 0, y: 0, width: 100, height: 80 } };
      next.set(id, { ...existing, ...patch });
      return next;
    });
  };

  // --- Bridge 1: VFS persistence and startup replay -------------------------
  const persistedIds = new Set<string>();

  const replayFromVfs = (): void => {
    let entries: { name: string }[] = [];
    try {
      entries = props.vfs.list(SURFACE_DIR);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.name.endsWith(".json")) continue;
      try {
        const file = JSON.parse(props.vfs.read(`${SURFACE_DIR}/${entry.name}`)) as SurfaceRecordFile;
        if (file?.surface?.id) props.surfaces.replay([file.surface]);
      } catch {
        // A corrupt record must not break the desktop; it is overwritten on
        // the next change of that surface.
      }
    }
  };

  createEffect(() => {
    const records = props.surfaces.items;
    const nextIds = new Set(records.filter((record) => record.persist).map((record) => record.id));
    for (const id of persistedIds) {
      if (!nextIds.has(id)) {
        try {
          props.vfs.remove(`${SURFACE_DIR}/${id}.json`);
        } catch {
          // Removing a record that is already gone is fine.
        }
      }
    }
    for (const record of records) {
      if (!record.persist) continue;
      try {
        props.vfs.write(`${SURFACE_DIR}/${record.id}.json`, JSON.stringify({ surface: record, savedAt: Date.now() }));
      } catch {
        // Persistence must not break rendering (read-only VFS in some hosts).
      }
    }
    persistedIds.clear();
    for (const id of nextIds) persistedIds.add(id);
  });

  onMount(() => {
    replayFromVfs();
  });

  onMount(() => {
    replayFromVfs();
  });

  // --- Bridge 2: service mirror --------------------------------------------
  if (props.session) {
    const session = props.session;
    const surfacesSignal = session.signal<SurfaceRecord[]>(SURFACES_KEY, []);
    createEffect(() => {
      const value = surfacesSignal();
      // A released key (service disconnect) never wipes local surfaces; only
      // an actual list patch from the authority changes the mirror.
      if (value) props.surfaces.applyAuthority(value);
    });

    const agentDataSignal = session.signal<Record<string, Record<string, string>>>(AGENT_DATA_KEY, {});
    createEffect(() => {
      const value = agentDataSignal();
      if (!value) return;
      for (const [owner, files] of Object.entries(value)) {
        for (const [path, content] of Object.entries(files ?? {})) {
          if (path.includes("..") || path.startsWith("/")) continue;
          try {
            props.vfs.write(`${AGENT_DATA_DIR}/${owner}/${path}`, content);
          } catch {
            // Read-only VFS: the mirror is best-effort.
          }
        }
      }
    });

    const notificationsSignal = session.signal<Array<{ id: number; title: string; body?: string }>>(AGENT_NOTIFICATIONS_KEY, []);
    const seenNotifications = new Set<number>();
    createEffect(() => {
      const events = notificationsSignal();
      if (!events) return;
      for (const event of events) {
        if (seenNotifications.has(event.id)) continue;
        seenNotifications.add(event.id);
        props.notifications.push(event.title, event.body);
      }
    });
  }

  // TTL expiry for surfaces runs on the registry's auto sweep; removing the
  // VFS record happens in the persistence effect above.

  // --- Content rendering ----------------------------------------------------
  const renderContent = (record: SurfaceRecord): JSX.Element => {
    const content = record.content;
    if (content.type === "static") {
      return (
        <div class="vela-surface__static">
          <Show when={content.title}>
            <Label muted>{content.title}</Label>
          </Show>
          <p class="vela-surface__body">{content.body}</p>
        </div>
      );
    }
    if (content.type === "chart") {
      return <ChartSurface record={record} session={props.session} />;
    }
    if (content.type === "remote") {
      return <RemoteSurface record={record} session={props.session} />;
    }
    const app = props.apps.find(content.appId);
    return (
      <Show when={app} fallback={<Label muted>Unknown app: {content.appId}</Label>}>
        {(known) => <Dynamic component={known().component} />}
      </Show>
    );
  };

  return (
    <div class="vela-surface-layer" role="region" aria-label="Agent surfaces">
      <For each={props.surfaces.items}>
        {(record) => (
          <Show when={record.kind !== "window" || !stateFor(record).minimized}>
            <WindowFrame
              record={{
                id: record.id,
                appId: `surface:${record.owner}`,
                title: record.title,
                geometry: record.kind === "window" && stateFor(record).maximized
                  ? { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight - 78 }
                  : record.geometry,
                state: {
                  minimized: false,
                  maximized: record.kind === "window" && stateFor(record).maximized,
                  restore: null,
                },
                minWidth: 120,
                minHeight: 60,
                kind: record.kind === "window" ? "window" : "widget",
                decorations: record.kind === "window",
              }}
              active={order().at(-1) === record.id}
              zIndex={zIndex(record.id)}
              onFocus={() => focus(record.id)}
              onMove={(x, y) => props.surfaces.reposition(record.id, { ...record.geometry, x, y })}
              onResize={(width, height) => props.surfaces.reposition(record.id, { ...record.geometry, width, height })}
              onSnap={(zone: SnapZone) => {
                if (zone === "top") updateState(record.id, { maximized: true, restore: record.geometry });
                else if (zone === "left") props.surfaces.reposition(record.id, { x: 0, y: 0, width: Math.round(window.innerWidth / 2), height: record.geometry.height });
                else props.surfaces.reposition(record.id, { x: Math.round(window.innerWidth / 2), y: 0, width: Math.round(window.innerWidth / 2), height: record.geometry.height });
              }}
              onMinimize={() => updateState(record.id, { minimized: true })}
              onMaximize={() => updateState(record.id, { maximized: !stateFor(record).maximized })}
              onClose={() => props.surfaces.destroy(record.id)}
            >
              {renderContent(record)}
            </WindowFrame>
          </Show>
        )}
      </For>
    </div>
  );
}

function ChartSurface(props: { record: SurfaceRecord; session: RemoteSession | null }): JSX.Element {
  const content = props.record.content;
  if (content.type !== "chart") return null;
  const rowsSignal = props.session
    ? props.session.signal<ChartRow[]>(dataKeyFor(props.record.owner, content.dataKey ?? "data"), [])
    : null;
  return (
    <Chart
      spec={content.spec}
      rows={rowsSignal ? rowsSignal() : undefined}
      class="vela-surface__chart"
    />
  );
}

function RemoteSurface(props: { record: SurfaceRecord; session: RemoteSession | null }): JSX.Element {
  const content = props.record.content;
  if (content.type !== "remote") return null;
  const valueSignal = props.session
    ? props.session.signal<unknown>(content.sourceKey, undefined)
    : null;
  const value = (): unknown => (valueSignal ? valueSignal() : undefined);
  return (
    <div class="vela-surface__remote" data-waiting={value() === undefined ? "true" : "false"}>
      <Show
        when={value() !== undefined}
        fallback={<span class="vela-chart__waiting-label">Waiting for data…</span>}
      >
        <pre>{JSON.stringify(value(), null, 2)}</pre>
      </Show>
    </div>
  );
}

/** Open the VFS directory holding persisted surfaces (used by Files and tests). */
export function readPersistedSurfaces(vfs: Vfs): SurfaceRecord[] {
  const records: SurfaceRecord[] = [];
  try {
    for (const entry of vfs.list(SURFACE_DIR)) {
      if (!entry.name.endsWith(".json")) continue;
      const file = JSON.parse(vfs.read(`${SURFACE_DIR}/${entry.name}`)) as SurfaceRecordFile;
      if (file?.surface?.id) records.push(file.surface);
    }
  } catch {
    // No persisted surfaces yet.
  }
  return records;
}

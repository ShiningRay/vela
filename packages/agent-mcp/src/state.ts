import { createSource, type WritableSource } from "@vela/remote";
import type { ChartRow } from "@vela/core";

/** Signal key that carries the authoritative surface table to the desktop. */
export const SURFACES_KEY = "agent.surfaces";
/** Signal key that mirrors the agent file whitelist to the desktop VFS. */
export const AGENT_DATA_KEY = "agent.agentdata";
/** Signal key that carries notification events to the desktop. */
export const AGENT_NOTIFICATIONS_KEY = "agent.notifications";

/** Namespaced signal key for a chart's rows: `<owner>.data.<dataKey>`. */
export function dataKeyFor(owner: string, dataKey: string): string {
  return `${owner}.data.${dataKey}`;
}

export interface NotificationEvent {
  id: number;
  owner: string;
  title: string;
  body?: string;
  at: number;
}

const NOTIFICATION_LIMIT = 100;

/**
 * Authority-side state shared by every MCP session and published to the
 * desktop over the existing remote signal protocol. Pure data plumbing, no
 * MCP knowledge, so it is unit testable without the SDK.
 */
export class AgentState {
  readonly dataSources = new Map<string, WritableSource<unknown>>();
  readonly notifications: WritableSource<NotificationEvent[]>;
  readonly agentData: WritableSource<Record<string, Record<string, string>>>;
  readonly #newSourceListeners = new Set<(key: string) => void>();
  #nextNotificationId = 1;

  constructor() {
    this.notifications = createSource<NotificationEvent[]>([]);
    this.agentData = createSource<Record<string, Record<string, string>>>({});
  }

  /** Fired when a data key is created so transports can start watching it. */
  onNewSource(listener: (key: string) => void): () => void {
    this.#newSourceListeners.add(listener);
    return () => {
      this.#newSourceListeners.delete(listener);
    };
  }

  ensureSource(key: string): WritableSource<unknown> {
    const existing = this.dataSources.get(key);
    if (existing) return existing;
    const source = createSource<unknown>(undefined);
    this.dataSources.set(key, source);
    for (const listener of [...this.#newSourceListeners]) {
      try {
        listener(key);
      } catch {
        // A broken subscriber must not break the publisher.
      }
    }
    return source;
  }

  publish(key: string, value: unknown): void {
    this.ensureSource(key).set(value);
  }

  publishRows(owner: string, dataKey: string, rows: ChartRow[]): void {
    this.publish(dataKeyFor(owner, dataKey), rows);
  }

  pushNotification(owner: string, title: string, body?: string): NotificationEvent {
    const event: NotificationEvent = { id: this.#nextNotificationId, owner, title, body, at: Date.now() };
    this.#nextNotificationId += 1;
    const current = this.notifications.get();
    this.notifications.set([...current.slice(-(NOTIFICATION_LIMIT - 1)), event]);
    return event;
  }

  readAgentFile(owner: string, path: string): string | undefined {
    return this.agentData.get()[owner]?.[path];
  }

  writeAgentFile(owner: string, path: string, content: string): void {
    const current = this.agentData.get();
    const next: Record<string, Record<string, string>> = {
      ...current,
      [owner]: { ...(current[owner] ?? {}), [path]: content },
    };
    this.agentData.set(next);
  }

  removeAgentOwner(owner: string): void {
    if (!(owner in this.agentData.get())) return;
    const next = { ...this.agentData.get() };
    delete next[owner];
    this.agentData.set(next);
  }
}

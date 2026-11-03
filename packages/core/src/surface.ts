import { createSignal, untrack } from "solid-js";
import { createDeepSignal } from "./signals";
import type { Geometry } from "./types";
import { validateChartSpec, type ChartSpec } from "./chart-spec";

export type SurfaceKind = "window" | "widget" | "panel";

/**
 * Whitelisted surface content. There is deliberately no html/url/script
 * variant: rich content must go through `component`, which references an
 * installed VPK app whose installation already passed the user consent gate.
 */
export type SurfaceContent =
  | { type: "static"; title: string; body: string }
  | { type: "remote"; sourceKey: string }
  | { type: "component"; appId: string; props?: unknown }
  | { type: "chart"; spec: ChartSpec; dataKey?: string };

export interface SurfaceRecord {
  id: string;
  owner: string;
  kind: SurfaceKind;
  title: string;
  geometry: Geometry;
  content: SurfaceContent;
  persist: boolean;
  ttlSeconds?: number;
  createdAt: number;
  expiresAt?: number;
}

export interface SurfaceCreateInput {
  id: string;
  owner: string;
  kind: SurfaceKind;
  title?: string;
  geometry: Geometry;
  content: SurfaceContent;
  persist?: boolean;
  ttlSeconds?: number;
}

export interface SurfacePatchInput {
  title?: string;
  geometry?: Geometry;
  content?: SurfaceContent;
  ttlSeconds?: number | null;
}

export type SurfaceErrorCode =
  | "duplicate_id"
  | "forbidden"
  | "unknown_surface"
  | "unsupported_content"
  | "invalid_surface"
  | "invalid_spec";

export class SurfaceError extends Error {
  readonly code: SurfaceErrorCode;
  readonly path?: string;
  readonly available?: string[];

  constructor(code: SurfaceErrorCode, message: string, options: { path?: string; available?: string[] } = {}) {
    super(message);
    this.name = "SurfaceError";
    this.code = code;
    this.path = options.path;
    this.available = options.available;
  }
}

const SURFACE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
const SURFACE_KINDS: readonly SurfaceKind[] = ["window", "widget", "panel"];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseContent(value: unknown): SurfaceContent {
  if (!isPlainObject(value)) {
    throw new SurfaceError("unsupported_content", "Surface content must be an object.");
  }
  switch (value.type) {
    case "static": {
      if (typeof value.title !== "string" || typeof value.body !== "string") {
        throw new SurfaceError("unsupported_content", 'Static content requires string "title" and "body".');
      }
      return { type: "static", title: value.title, body: value.body };
    }
    case "remote": {
      if (typeof value.sourceKey !== "string" || !value.sourceKey) {
        throw new SurfaceError("unsupported_content", 'Remote content requires a non-empty "sourceKey".');
      }
      return { type: "remote", sourceKey: value.sourceKey };
    }
    case "component": {
      if (typeof value.appId !== "string" || !value.appId) {
        throw new SurfaceError("unsupported_content", 'Component content requires a non-empty "appId".');
      }
      const content: SurfaceContent = { type: "component", appId: value.appId };
      if (value.props !== undefined) content.props = value.props;
      return content;
    }
    case "chart": {
      const validation = validateChartSpec(value.spec);
      if (!validation.ok) {
        const first = validation.errors[0]!;
        throw new SurfaceError("invalid_spec", first.message, { path: first.path, available: first.available });
      }
      const content: SurfaceContent = { type: "chart", spec: value.spec as ChartSpec };
      if (value.dataKey !== undefined) {
        if (typeof value.dataKey !== "string" || !value.dataKey) {
          throw new SurfaceError("unsupported_content", 'Chart content requires a non-empty string "dataKey".');
        }
        content.dataKey = value.dataKey;
      }
      return content;
    }
    default:
      throw new SurfaceError(
        "unsupported_content",
        `Unsupported surface content type: ${String(value.type)}. Supported: static, remote, component, chart.`,
        { available: ["static", "remote", "component", "chart"] },
      );
  }
}

function parseGeometry(value: unknown): Geometry {
  if (!isPlainObject(value)) {
    throw new SurfaceError("invalid_surface", "Surface geometry must be an object.");
  }
  const { x, y, width, height } = value as Record<string, unknown>;
  if (![x, y, width, height].every((entry) => typeof entry === "number" && Number.isFinite(entry))) {
    throw new SurfaceError("invalid_surface", "Surface geometry requires finite x, y, width and height.");
  }
  if ((width as number) <= 0 || (height as number) <= 0) {
    throw new SurfaceError("invalid_surface", "Surface geometry requires positive width and height.");
  }
  return { x, y, width, height } as Geometry;
}

type Signal<T> = readonly [
  () => T,
  (value: T | ((prev: T) => T)) => T,
];

export interface SurfaceRegistryOptions {
  /** Sweep interval for TTL expiry; 0 disables the automatic timer. */
  autoSweepMs?: number;
  now?: () => number;
}

/**
 * Registry of programmatic desktop surfaces.
 *
 * Every surface belongs to an owner; mutation APIs take the caller's owner and
 * reject cross-owner access with `forbidden`. The desktop renderer and the
 * remote authority sync use the dedicated `applyAuthority`/`replay` paths,
 * which are trusted and validate content only.
 */
export class SurfaceRegistry {
  readonly #records: Signal<SurfaceRecord[]>;
  readonly #authority: Set<string> = new Set();
  readonly #replayed: Set<string> = new Set();
  readonly #now: () => number;
  #sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: SurfaceRegistryOptions = {}) {
    this.#now = options.now ?? Date.now;
    this.#records = createDeepSignal<SurfaceRecord[]>([]);
    const autoSweepMs = options.autoSweepMs ?? 0;
    if (autoSweepMs > 0) this.startAutoSweep(autoSweepMs);
  }

  get items(): SurfaceRecord[] {
    return this.#records[0]();
  }

  readonly #listeners = new Set<() => void>();

  /** RemoteHub-compatible source view over the record list. */
  get source(): { get: () => SurfaceRecord[]; subscribe: (listener: () => void) => () => void } {
    return {
      get: () => this.#records[0](),
      subscribe: (listener: () => void) => {
        this.#listeners.add(listener);
        return () => {
          this.#listeners.delete(listener);
        };
      },
    };
  }

  get(id: string): SurfaceRecord | undefined {
    return this.#records[0]().find((record) => record.id === id);
  }

  list(owner?: string): SurfaceRecord[] {
    const records = this.#records[0]();
    return owner === undefined ? records : records.filter((record) => record.owner === owner);
  }

  create(input: SurfaceCreateInput): SurfaceRecord {
    return untrack(() => this.#create(input));
  }

  #create(input: SurfaceCreateInput): SurfaceRecord {
    if (typeof input.id !== "string" || !SURFACE_ID_PATTERN.test(input.id)) {
      throw new SurfaceError("invalid_surface", `Surface id must match ${SURFACE_ID_PATTERN.source}.`);
    }
    if (typeof input.owner !== "string" || !input.owner) {
      throw new SurfaceError("invalid_surface", "Surface owner is required.");
    }
    if (!SURFACE_KINDS.includes(input.kind)) {
      throw new SurfaceError("invalid_surface", `Surface kind must be one of: ${SURFACE_KINDS.join(", ")}.`, {
        available: [...SURFACE_KINDS],
      });
    }
    if (this.has(input.id)) {
      throw new SurfaceError("duplicate_id", `Surface "${input.id}" already exists.`);
    }
    const now = this.#now();
    const record: SurfaceRecord = {
      id: input.id,
      owner: input.owner,
      kind: input.kind,
      title: input.title?.trim() ? input.title : input.id,
      geometry: parseGeometry(input.geometry),
      content: parseContent(input.content),
      persist: input.persist ?? false,
      createdAt: now,
    };
    if (input.ttlSeconds !== undefined) {
      if (typeof input.ttlSeconds !== "number" || !Number.isFinite(input.ttlSeconds) || input.ttlSeconds <= 0) {
        throw new SurfaceError("invalid_surface", "ttlSeconds must be a positive number.");
      }
      record.ttlSeconds = input.ttlSeconds;
      record.expiresAt = now + input.ttlSeconds * 1000;
    }
    this.#set((records) => [...records, record]);
    return record;
  }

  patch(id: string, owner: string, patch: SurfacePatchInput): SurfaceRecord {
    return untrack(() => {
      const record = this.get(id);
      if (!record) {
        throw new SurfaceError("unknown_surface", `Surface "${id}" does not exist.`);
      }
      if (record.owner !== owner) {
        throw new SurfaceError("forbidden", `Surface "${id}" belongs to owner "${record.owner}".`);
      }
      return this.#applyPatch(record, patch);
    });
  }

  remove(id: string, owner: string): SurfaceRecord {
    return untrack(() => {
      const record = this.get(id);
      if (!record) {
        throw new SurfaceError("unknown_surface", `Surface "${id}" does not exist.`);
      }
      if (record.owner !== owner) {
        throw new SurfaceError("forbidden", `Surface "${id}" belongs to owner "${record.owner}".`);
      }
      this.#delete(id);
      return record;
    });
  }

  /**
   * Trusted geometry update from the desktop renderer itself (the user
   * dragging a surface frame). Not available to remote callers, so it skips
   * the owner check while still validating the geometry.
   */
  reposition(id: string, geometry: Geometry): SurfaceRecord | undefined {
    return untrack(() => {
      const record = this.get(id);
      if (!record) return undefined;
      const parsed = parseGeometry(geometry);
      const next = { ...record, geometry: parsed };
      this.#set((records) => records.map((current) => (current.id === id ? next : current)));
      return next;
    });
  }

  /**
   * Trusted removal used by the renderer (surface close button) and by the
   * authority mirror. Returns the removed record, or undefined.
   */
  destroy(id: string): SurfaceRecord | undefined {
    return untrack(() => {
      const record = this.get(id);
      if (!record) return undefined;
      this.#delete(id);
      return record;
    });
  }

  /** Remove expired surfaces; returns the records that were removed. */
  sweepExpired(now: number = this.#now()): SurfaceRecord[] {
    return untrack(() => {
      const expired = this.#records[0]().filter((record) => record.expiresAt !== undefined && record.expiresAt <= now);
      if (expired.length === 0) return [];
      const ids = new Set(expired.map((record) => record.id));
      this.#set((records) => records.filter((record) => !ids.has(record.id)));
      return expired;
    });
  }

  startAutoSweep(intervalMs: number): void {
    this.stopAutoSweep();
    this.#sweepTimer = setInterval(() => {
      this.sweepExpired();
    }, intervalMs);
    // In Node a sweep timer must not keep the service process alive.
    (this.#sweepTimer as unknown as { unref?: () => void }).unref?.();
  }

  stopAutoSweep(): void {
    if (this.#sweepTimer !== null) {
      clearInterval(this.#sweepTimer);
      this.#sweepTimer = null;
    }
  }

  /**
   * Trusted upsert used by the desktop when mirroring the service's
   * authoritative surface table. Ids missing from the list are removed unless
   * they were injected locally (replayed from VFS or registered by a package).
   */
  applyAuthority(records: SurfaceRecord[]): void {
    untrack(() => this.#applyAuthority(records));
  }

  #applyAuthority(records: SurfaceRecord[]): void {
    const incoming = new Set<string>();
    for (const record of records) {
      incoming.add(record.id);
      this.#upsertTrusted(record, "authority");
    }
    const stale = this.#records[0]()
      .filter((record) => this.#authority.has(record.id) && !incoming.has(record.id))
      .map((record) => record.id);
    for (const id of stale) {
      this.#authority.delete(id);
    }
    if (stale.length > 0) {
      const ids = new Set(stale);
      this.#set((current) => current.filter((record) => !ids.has(record.id)));
    }
  }

  /** Trusted injection used when the shell replays persisted surfaces from VFS. */
  replay(records: SurfaceRecord[]): void {
    untrack(() => {
      for (const record of records) {
        if (this.has(record.id)) continue;
        this.#upsertTrusted(record, "replayed");
      }
    });
  }

  /**
   * Trusted single-record upsert that removes nothing. Used to merge
   * package-declared surfaces into the authority table without touching
   * records owned by other sources.
   */
  upsert(record: SurfaceRecord): void {
    untrack(() => this.#upsertTrusted(record, "authority"));
  }

  #upsertTrusted(record: SurfaceRecord, origin: "authority" | "replayed"): void {
    const content = parseContent(record.content);
    const geometry = parseGeometry(record.geometry);
    const next: SurfaceRecord = {
      ...record,
      title: record.title || record.id,
      content,
      geometry,
    };
    const originSet = origin === "authority" ? this.#authority : this.#replayed;
    if (origin === "authority") this.#replayed.delete(record.id);
    originSet.add(record.id);
    this.#set((records) => {
      const index = records.findIndex((current) => current.id === record.id);
      if (index === -1) return [...records, next];
      const copy = records.slice();
      copy[index] = next;
      return copy;
    });
  }

  /** Drop the replay marker once the authority takes over a replayed surface. */
  #applyPatch(record: SurfaceRecord, patch: SurfacePatchInput): SurfaceRecord {
    let next = record;
    if (patch.title !== undefined) {
      if (typeof patch.title !== "string" || !patch.title.trim()) {
        throw new SurfaceError("invalid_surface", "title must be a non-empty string.");
      }
      next = { ...next, title: patch.title };
    }
    if (patch.geometry !== undefined) {
      next = { ...next, geometry: parseGeometry(patch.geometry) };
    }
    if (patch.content !== undefined) {
      next = { ...next, content: parseContent(patch.content) };
    }
    if (patch.ttlSeconds !== undefined) {
      if (patch.ttlSeconds === null) {
        next = { ...next, ttlSeconds: undefined, expiresAt: undefined };
      } else {
        if (typeof patch.ttlSeconds !== "number" || !Number.isFinite(patch.ttlSeconds) || patch.ttlSeconds <= 0) {
          throw new SurfaceError("invalid_surface", "ttlSeconds must be a positive number or null.");
        }
        next = {
          ...next,
          ttlSeconds: patch.ttlSeconds,
          expiresAt: this.#now() + patch.ttlSeconds * 1000,
        };
      }
    }
    this.#set((records) => records.map((current) => (current.id === record.id ? next : current)));
    return next;
  }

  #delete(id: string): void {
    this.#authority.delete(id);
    this.#replayed.delete(id);
    this.#set((records) => records.filter((record) => record.id !== id));
  }

  #set(updater: (records: SurfaceRecord[]) => SurfaceRecord[]): void {
    this.#records[1]((records) => updater(records));
    for (const listener of [...this.#listeners]) {
      try {
        listener();
      } catch {
        // A broken subscriber must not break the registry.
      }
    }
  }

  has(id: string): boolean {
    return this.get(id) !== undefined;
  }
}

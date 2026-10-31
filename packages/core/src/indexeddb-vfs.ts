import {
  defaultVfsEntries,
  MemoryVfs,
  normalizePath,
  parentPath,
  type Vfs,
  type VfsEntry,
  type VfsEntryKind,
} from "./vfs";

const DEFAULT_DATABASE = "vela-vfs";
const STORE = "entries";

interface StoredEntry {
  path: string;
  kind: VfsEntryKind;
  content?: string;
  updatedAt: number;
}

interface VfsNode {
  kind: VfsEntryKind;
  content?: string;
  updatedAt: number;
}

export interface IndexedDbVfsOptions {
  databaseName?: string;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function openDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "path" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open Vela VFS"));
    request.onblocked = () => reject(new Error("Vela VFS is blocked by another connection"));
  });
}

/**
 * IndexedDB-backed VFS with a synchronous in-memory view.
 *
 * Reads stay synchronous for the UI; mutations update memory immediately and
 * append serialized IndexedDB transactions. `flush()` lets tests and the
 * import/export path wait until the durable copy is complete.
 */
export class IndexedDbVfs implements Vfs {
  readonly #nodes = new Map<string, VfsNode>();
  readonly #db: IDBDatabase;
  #writes: Promise<void> = Promise.resolve();

  private constructor(db: IDBDatabase, nodes: Iterable<[string, VfsNode]>) {
    this.#db = db;
    for (const [path, node] of nodes) this.#nodes.set(path, node);
    this.#db.onversionchange = () => this.#db.close();
  }

  static async open(options: IndexedDbVfsOptions = {}): Promise<IndexedDbVfs> {
    if (typeof indexedDB === "undefined") {
      throw new Error("IndexedDB is not available.");
    }
    const db = await openDatabase(options.databaseName ?? DEFAULT_DATABASE);
    const stored = await requestToPromise(
      db.transaction(STORE, "readonly").objectStore(STORE).getAll() as IDBRequest<StoredEntry[]>,
    );

    if (stored.length === 0) {
      const seed = defaultVfsEntries();
      const nodes = new Map<string, VfsNode>();
      for (const entry of seed) {
        nodes.set(entry.path, {
          kind: entry.kind,
          content: entry.content,
          updatedAt: entry.updatedAt,
        });
      }
      const vfs = new IndexedDbVfs(db, nodes);
      vfs.#enqueue((store) => {
        for (const entry of seed) store.put(entry);
      });
      await vfs.flush();
      return vfs;
    }

    const nodes = new Map<string, VfsNode>();
    for (const entry of stored) {
      nodes.set(entry.path, {
        kind: entry.kind,
        content: entry.content,
        updatedAt: entry.updatedAt,
      });
    }
    if (!nodes.has("/")) {
      const root: VfsNode = { kind: "dir", updatedAt: Date.now() };
      nodes.set("/", root);
    }
    return new IndexedDbVfs(db, nodes);
  }

  list(path: string): VfsEntry[] {
    const normalized = normalizePath(path);
    const node = this.#nodes.get(normalized);
    if (!node || node.kind !== "dir") {
      throw new Error(`Not a directory: ${normalized}`);
    }

    const prefix = normalized === "/" ? "/" : `${normalized}/`;
    const entries: VfsEntry[] = [];
    for (const [entryPath, entry] of this.#nodes) {
      if (entryPath === normalized || !entryPath.startsWith(prefix)) continue;
      const rest = entryPath.slice(prefix.length);
      if (rest.includes("/")) continue;
      entries.push({
        path: entryPath,
        name: rest,
        kind: entry.kind,
        updatedAt: entry.updatedAt,
      });
    }
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }

  read(path: string): string {
    const normalized = normalizePath(path);
    const node = this.#nodes.get(normalized);
    if (!node) throw new Error(`No such file: ${normalized}`);
    if (node.kind !== "file") throw new Error(`Not a file: ${normalized}`);
    return node.content ?? "";
  }

  write(path: string, content: string): void {
    const normalized = normalizePath(path);
    if (normalized === "/") throw new Error("Cannot write to root.");
    this.#ensureParent(normalized);
    this.#put({ path: normalized, kind: "file", content, updatedAt: Date.now() });
  }

  mkdir(path: string): void {
    const normalized = normalizePath(path);
    if (normalized === "/") return;
    this.#ensureParent(normalized);
    this.#put({ path: normalized, kind: "dir", updatedAt: Date.now() });
  }

  remove(path: string): void {
    const normalized = normalizePath(path);
    if (normalized === "/") throw new Error("Cannot remove root.");
    if (!this.#nodes.has(normalized)) return;

    const prefix = `${normalized}/`;
    const removed = [...this.#nodes.keys()].filter(
      (entryPath) => entryPath === normalized || entryPath.startsWith(prefix),
    );
    for (const entryPath of removed) this.#nodes.delete(entryPath);
    this.#enqueue((store) => {
      for (const entryPath of removed) store.delete(entryPath);
    });
  }

  /** Wait for queued IndexedDB writes. */
  flush(): Promise<void> {
    return this.#writes;
  }

  close(): void {
    this.#db.close();
  }

  #put(entry: StoredEntry): void {
    this.#nodes.set(entry.path, {
      kind: entry.kind,
      content: entry.content,
      updatedAt: entry.updatedAt,
    });
    this.#enqueue((store) => store.put(entry));
  }

  #ensureParent(path: string): void {
    const parent = parentPath(path);
    if (parent === "/") return;
    const node = this.#nodes.get(parent);
    if (!node) {
      this.#ensureParent(parent);
      this.#put({ path: parent, kind: "dir", updatedAt: Date.now() });
      return;
    }
    if (node.kind !== "dir") {
      throw new Error(`Parent is not a directory: ${parent}`);
    }
  }

  #enqueue(mutator: (store: IDBObjectStore) => void): void {
    const next = this.#writes.then(
      () =>
        new Promise<void>((resolve, reject) => {
          const transaction = this.#db.transaction(STORE, "readwrite");
          mutator(transaction.objectStore(STORE));
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error ?? new Error("VFS write failed"));
          transaction.onabort = () => reject(transaction.error ?? new Error("VFS write aborted"));
        }),
    );
    this.#writes = next.catch(() => undefined);
  }
}

/** Use IndexedDB when available, otherwise fall back to the in-memory VFS. */
export async function openPersistentVfs(options: IndexedDbVfsOptions = {}): Promise<Vfs> {
  try {
    return await IndexedDbVfs.open(options);
  } catch {
    return new MemoryVfs();
  }
}

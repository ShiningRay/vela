export type VfsEntryKind = "file" | "dir";

export interface VfsEntry {
  path: string;
  name: string;
  kind: VfsEntryKind;
  updatedAt: number;
}

export interface Vfs {
  list(path: string): VfsEntry[];
  read(path: string): string;
  write(path: string, content: string): void;
  mkdir(path: string): void;
  remove(path: string): void;
}

export function normalizePath(path: string): string {
  const parts = path.split("/").filter((part) => part.length > 0);
  return `/${parts.join("/")}`;
}

export function parentPath(path: string): string {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf("/");
  return index <= 0 ? "/" : normalized.slice(0, index);
}

export function baseName(path: string): string {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf("/");
  return normalized.slice(index + 1);
}

interface Node {
  kind: VfsEntryKind;
  content?: string;
  updatedAt: number;
}

/**
 * In-memory VFS. The interface is the contract; a persistent backend
 * (IndexedDB / OPFS) will implement the same methods later.
 */
export class MemoryVfs implements Vfs {
  readonly #nodes = new Map<string, Node>();

  constructor() {
    const now = Date.now();
    this.#nodes.set("/", { kind: "dir", updatedAt: now });
    this.#nodes.set("/Desktop", { kind: "dir", updatedAt: now });
    this.#nodes.set("/Documents", { kind: "dir", updatedAt: now });
    this.#nodes.set("/Desktop/readme.txt", {
      kind: "file",
      content: "Welcome to Vela.\n\nDouble-click an icon to open a window.",
      updatedAt: now,
    });
    this.#nodes.set("/Documents/welcome.md", {
      kind: "file",
      content:
        "# Welcome to Vela\n\nThis is an in-memory VFS.\nA persistent backend (IndexedDB / OPFS) lands in P3.",
      updatedAt: now,
    });
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
    this.#nodes.set(normalized, { kind: "file", content, updatedAt: Date.now() });
  }

  mkdir(path: string): void {
    const normalized = normalizePath(path);
    if (normalized === "/") return;
    this.#ensureParent(normalized);
    this.#nodes.set(normalized, { kind: "dir", updatedAt: Date.now() });
  }

  remove(path: string): void {
    const normalized = normalizePath(path);
    if (normalized === "/") throw new Error("Cannot remove root.");
    if (!this.#nodes.has(normalized)) return;

    const prefix = `${normalized}/`;
    for (const entryPath of [...this.#nodes.keys()]) {
      if (entryPath === normalized || entryPath.startsWith(prefix)) {
        this.#nodes.delete(entryPath);
      }
    }
  }

  #ensureParent(path: string): void {
    const parent = parentPath(path);
    if (parent === "/") return;
    const node = this.#nodes.get(parent);
    if (!node) {
      this.#ensureParent(parent);
      this.#nodes.set(parent, { kind: "dir", updatedAt: Date.now() });
      return;
    }
    if (node.kind !== "dir") {
      throw new Error(`Parent is not a directory: ${parent}`);
    }
  }
}

import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { IndexedDbVfs } from "../src/indexeddb-vfs";

function databaseName(): string {
  return `vela-test-${crypto.randomUUID()}`;
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("deleteDatabase blocked"));
  });
}

describe("IndexedDbVfs", () => {
  it("seeds, writes and reloads entries across instances", async () => {
    const name = databaseName();
    const first = await IndexedDbVfs.open({ databaseName: name });

    expect(first.read("/Documents/welcome.md")).toContain("IndexedDB");
    first.write("/Documents/notes.txt", "persisted");
    first.mkdir("/Projects");
    await first.flush();
    first.close();

    const second = await IndexedDbVfs.open({ databaseName: name });
    expect(second.read("/Documents/notes.txt")).toBe("persisted");
    expect(second.list("/").map((entry) => entry.name)).toEqual(["Desktop", "Documents", "Projects"]);

    second.write("/Projects/vela/readme.md", "nested");
    expect(second.list("/Projects/vela").map((entry) => entry.name)).toEqual(["readme.md"]);
    second.remove("/Documents/notes.txt");
    await second.flush();
    second.close();

    const third = await IndexedDbVfs.open({ databaseName: name });
    expect(() => third.read("/Documents/notes.txt")).toThrow(/No such file/);
    expect(third.read("/Projects/vela/readme.md")).toBe("nested");
    third.close();
    await deleteDatabase(name);
  });

  it("keeps the VFS contract for directories and root", async () => {
    const name = databaseName();
    const vfs = await IndexedDbVfs.open({ databaseName: name });

    expect(() => vfs.write("/", "nope")).toThrow(/root/);
    expect(() => vfs.remove("/")).toThrow(/root/);
    expect(() => vfs.read("/Desktop")).toThrow(/Not a file/);
    expect(() => vfs.list("/Desktop/readme.txt")).toThrow(/Not a directory/);

    vfs.remove("/Documents");
    expect(vfs.list("/").map((entry) => entry.name)).toEqual(["Desktop"]);
    vfs.close();
    await deleteDatabase(name);
  });
});

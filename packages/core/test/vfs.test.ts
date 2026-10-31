import { describe, expect, it } from "vitest";
import { baseName, MemoryVfs, normalizePath, parentPath } from "../src/vfs";

describe("path helpers", () => {
  it("normalizes and splits paths", () => {
    expect(normalizePath("//Desktop//notes.txt")).toBe("/Desktop/notes.txt");
    expect(parentPath("/Desktop/notes.txt")).toBe("/Desktop");
    expect(parentPath("/")).toBe("/");
    expect(baseName("/Desktop/notes.txt")).toBe("notes.txt");
  });
});

describe("MemoryVfs", () => {
  it("writes, lists and reads files", () => {
    const vfs = new MemoryVfs();
    vfs.write("/Desktop/notes.txt", "hello");

    expect(vfs.read("/Desktop/notes.txt")).toBe("hello");
    expect(vfs.list("/Desktop").map((entry) => entry.name)).toContain("notes.txt");
    expect(vfs.list("/").map((entry) => entry.name)).toEqual(["Desktop", "Documents"]);
  });

  it("creates parents, makes directories and removes recursively", () => {
    const vfs = new MemoryVfs();
    vfs.write("/Documents/projects/vela/todo.md", "ship it");
    vfs.mkdir("/Documents/archive");

    expect(vfs.list("/Documents/projects/vela").map((entry) => entry.name)).toEqual(["todo.md"]);

    vfs.remove("/Documents/projects");
    expect(vfs.list("/Documents").map((entry) => entry.name)).toEqual(["archive", "welcome.md"]);
    expect(() => vfs.read("/Documents/projects/vela/todo.md")).toThrow(/No such file/);
  });

  it("rejects writing to the root and reading directories", () => {
    const vfs = new MemoryVfs();
    expect(() => vfs.write("/", "nope")).toThrow(/root/);
    expect(() => vfs.read("/Desktop")).toThrow(/Not a file/);
  });
});

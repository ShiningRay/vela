import { describe, expect, it } from "vitest";
import { MemoryVfs, SurfaceRegistry } from "@vela/core";
import {
  describePermission,
  parseAgentSection,
  parsePermissions,
  readGrants,
  registerPackageAgent,
  unregisterPackageAgent,
  writeGrants,
} from "../src/agent-manifest";
import type { VpkPackage } from "../src/packages";

const surfaceContent = {
  type: "chart",
  spec: { kind: "line", encoding: { x: "date", y: "revenue" } },
  dataKey: "daily",
};

function agentSection(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    surfaces: [
      { id: "main", kind: "widget", title: "Board", geometry: { x: 0, y: 0, width: 320, height: 200 }, content: surfaceContent },
    ],
    charts: [{ id: "trend", title: "Trend", spec: { kind: "bar", encoding: { x: "date", y: "revenue" } }, dataKey: "daily" }],
    datasources: [{ key: "daily", tool: "query" }],
    tools: [
      { name: "query", type: "http", endpoint: "https://api.example.com/daily", method: "GET", params: { from: "string" } },
    ],
    ...overrides,
  };
}

describe("parseAgentSection", () => {
  it("returns empty declarations for packages without the section", () => {
    expect(parseAgentSection(undefined, "pkg")).toEqual({ surfaces: [], charts: [], datasources: [], tools: [] });
  });

  it("accepts a valid declaration set", () => {
    const section = parseAgentSection(agentSection(), "sales-board");
    expect(section.surfaces).toHaveLength(1);
    expect(section.charts).toHaveLength(1);
    expect(section.datasources).toEqual([{ key: "daily", tool: "query" }]);
    expect(section.tools[0]).toMatchObject({ name: "query", type: "http", endpoint: "https://api.example.com/daily" });
  });

  it("rejects unknown fields in the agent section", () => {
    expect(() => parseAgentSection(agentSection({ extra: true }), "sales-board")).toThrow(/agent\.extra: unknown field/);
  });

  it("rejects code-bearing tool declarations with unsupported_tool", () => {
    for (const field of ["script", "module", "code", "entry", "handler", "source"]) {
      const tools = [{ name: "run", type: "http", endpoint: "https://api.example.com", [field]: "eval" }];
      expect(() => parseAgentSection(agentSection({ tools }), "sales-board")).toThrow(/unsupported_tool/);
    }
    expect(() => parseAgentSection(agentSection({ tools: [{ name: "run", type: "code" }] }), "sales-board")).toThrow(
      /unsupported_tool.*"http" or "static"/,
    );
  });

  it("rejects unknown tool fields that are not code entries", () => {
    const tools = [{ name: "run", type: "http", endpoint: "https://api.example.com", wat: 1 }];
    expect(() => parseAgentSection(agentSection({ tools }), "sales-board")).toThrow(/wat: unknown field/);
  });

  it("rejects static tool paths that escape the package", () => {
    const query = { name: "query", type: "http", endpoint: "https://api.example.com/daily", method: "GET" };
    for (const path of ["../other/secret.json", "/etc/passwd", "a/../../b.json"]) {
      const tools = [query, { name: "seed", type: "static", path }];
      expect(() => parseAgentSection(agentSection({ tools }), "sales-board")).toThrow(/forbidden.*escapes the package/);
    }
    expect(() =>
      parseAgentSection(
        agentSection({ tools: [query, { name: "seed", type: "static", path: "data/seed.json" }] }),
        "sales-board",
      ),
    ).not.toThrow();
  });

  it("rejects datasources referencing undeclared tools (cross-package reference)", () => {
    const datasources = [{ key: "daily", tool: "foreign_tool" }];
    expect(() => parseAgentSection(agentSection({ datasources }), "sales-board")).toThrow(/forbidden.*foreign_tool/);
  });

  it("rejects charts and surfaces referencing undeclared dataKeys", () => {
    const surfaces = [
      { id: "main", kind: "widget", geometry: { x: 0, y: 0, width: 10, height: 10 }, content: { type: "chart", spec: { kind: "kpi", encoding: { value: "v" } }, dataKey: "unknown" } },
    ];
    expect(() => parseAgentSection(agentSection({ surfaces }), "sales-board")).toThrow(/forbidden.*unknown/);
    const charts = [{ id: "trend", spec: { kind: "kpi", encoding: { value: "v" } }, dataKey: "unknown" }];
    expect(() => parseAgentSection(agentSection({ charts }), "sales-board")).toThrow(/forbidden.*unknown/);
  });

  it("rejects html/url content and invalid ids", () => {
    const surfaces = [
      { id: "main", kind: "widget", geometry: { x: 0, y: 0, width: 10, height: 10 }, content: { type: "html", body: "<script>" } },
    ];
    expect(() => parseAgentSection(agentSection({ surfaces }), "sales-board")).toThrow(/unsupported content type/);
    const surfaces2 = [
      { id: "Bad Id!", kind: "widget", geometry: { x: 0, y: 0, width: 10, height: 10 }, content: { type: "static", title: "t", body: "b" } },
    ];
    expect(() => parseAgentSection(agentSection({ surfaces: surfaces2 }), "sales-board")).toThrow(/surfaces\.id must match/);
  });

  it("rejects malformed permissions", () => {
    expect(parsePermissions(["surface:create", "signal:publish", "net:api.example.com"], "p")).toEqual([
      "surface:create",
      "signal:publish",
      "net:api.example.com",
    ]);
    expect(() => parsePermissions(["root"], "p")).toThrow(/not a valid permission/);
    expect(() => parsePermissions("surface:create", "p")).toThrow(/must be an array/);
  });

  it("describes permissions for the consent dialog", () => {
    expect(describePermission("surface:create")).toContain("surfaces");
    expect(describePermission("net:api.example.com")).toContain("api.example.com");
  });
});

describe("grants and declaration registration", () => {
  function fakePackage(manifest: Record<string, unknown>, files: Record<string, string> = {}): VpkPackage {
    return { manifest: manifest as VpkPackage["manifest"], files };
  }

  const manifest = {
    id: "sales-board",
    name: "Sales Board",
    version: "1.0.0",
    entry: "index.html",
    agent: agentSection(),
    permissions: ["surface:create", "signal:publish", "net:api.example.com"],
  };

  it("stores and reads grants; missing grants read as null", () => {
    const vfs = new MemoryVfs();
    expect(readGrants(vfs, "sales-board")).toBeNull();
    writeGrants(vfs, "sales-board", ["surface:create"]);
    expect(readGrants(vfs, "sales-board")).toMatchObject({ id: "sales-board", permissions: ["surface:create"] });
    expect(vfs.read("/Apps/sales-board/grants.json")).toContain("surface:create");
  });

  it("registers declared surfaces and charts under the pkg.<id> owner", () => {
    const vfs = new MemoryVfs();
    const surfaces = new SurfaceRegistry();
    registerPackageAgent(fakePackage(manifest), { surfaces });

    expect(surfaces.list("pkg.sales-board").map((record) => record.id)).toEqual([
      "sales-board.main",
      "sales-board.trend",
    ]);
    const chart = surfaces.get("sales-board.trend")!;
    expect(chart.content).toMatchObject({ type: "chart", dataKey: "daily" });
    expect(chart.persist).toBe(true);
  });

  it("unregistering removes the package's surfaces and keeps others", () => {
    const vfs = new MemoryVfs();
    const surfaces = new SurfaceRegistry();
    registerPackageAgent(fakePackage(manifest), { surfaces });
    surfaces.create({
      id: "agent-own",
      owner: "agent.other",
      kind: "widget",
      geometry: { x: 0, y: 0, width: 10, height: 10 },
      content: { type: "static", title: "t", body: "b" },
    });

    unregisterPackageAgent("sales-board", { surfaces });
    expect(surfaces.list("pkg.sales-board")).toHaveLength(0);
    expect(surfaces.has("agent-own")).toBe(true);
  });

  it("registers idempotently", () => {
    const surfaces = new SurfaceRegistry();
    const pkg = fakePackage(manifest);
    registerPackageAgent(pkg, { surfaces });
    registerPackageAgent(pkg, { surfaces });
    expect(surfaces.list("pkg.sales-board")).toHaveLength(2);
  });
});

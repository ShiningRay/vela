import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { strToU8, zipSync } from "fflate";

/**
 * Declarative vpk agent capabilities end-to-end: install with consent, agent
 * tool calls through MCP, data flowing into the package's own charts, the
 * reject path writing nothing, and uninstall revoking everything.
 */

let service: ChildProcess | null = null;
let sessionId: string | null = null;
let callId = 0;

const BASE = "http://127.0.0.1:4317/mcp";

async function rpc(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  const response = await fetch(BASE, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: ++callId, method, params }),
  });
  const nextSession = response.headers.get("mcp-session-id");
  if (nextSession) sessionId = nextSession;
  const text = await response.text();
  if (text.includes("data:")) {
    for (const line of text.split("\n")) {
      if (line.startsWith("data:")) return JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
    }
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Protocol-level errors (e.g. unknown tool) answer with plain text.
    return { __protocolError: text };
  }
}

async function callTool(name: string, args: Record<string, unknown> = {}): Promise<{ isError?: boolean; body: Record<string, unknown> }> {
  const result = await rpc("tools/call", { name, arguments: args });
  if (result.__protocolError !== undefined || result.error !== undefined) {
    return { isError: true, body: { error: "mcp_error" } };
  }
  const payload = result.result as { content?: Array<{ text: string }>; isError?: boolean } | undefined;
  const text = payload?.content?.[0]?.text ?? "{}";
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Unregistered tools surface as protocol-level "MCP error …" text.
    body = { error: "mcp_error" };
  }
  return {
    isError: payload?.isError || body.error === "mcp_error",
    body,
  };
}

async function startService(): Promise<void> {
  service = spawn("node", ["services/demo/dist/server.cjs"], { cwd: process.cwd(), stdio: "ignore" });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch("http://127.0.0.1:4317/health")).ok) return;
    } catch {
      // Retry.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("service did not become ready");
}

test.beforeAll(async () => {
  await startService();
});

test.afterAll(async () => {
  service?.kill("SIGTERM");
  service = null;
});

interface LocalApi {
  url: string;
  close: () => Promise<void>;
}

function startLocalApi(): Promise<LocalApi> {
  return new Promise((resolve) => {
    const rows = [
      { date: "2026-11-01", revenue: 12 },
      { date: "2026-11-02", revenue: 18 },
    ];
    const server: Server = createServer((req, res) => {
      res.setHeader("content-type", "application/json");
      // The publish contract: a successful http tool response body is a row array.
      res.end(JSON.stringify(rows));
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

function boardPackage(id: string, api: LocalApi): Buffer {
  const manifest = {
    id,
    name: "Board " + id,
    version: "1.0.0",
    entry: "index.html",
    icon: "▤",
    agent: {
      surfaces: [
        {
          id: "kpi",
          kind: "widget",
          title: "Sales today",
          geometry: { x: 40, y: 60, width: 220, height: 120 },
          content: {
            type: "chart",
            spec: { kind: "kpi", title: "Sales today", decimals: 1, encoding: { value: "revenue" } },
            dataKey: "daily",
          },
        },
      ],
      datasources: [{ key: "daily", tool: "query_daily" }],
      tools: [
        {
          name: "query_daily",
          type: "http",
          endpoint: `${api.url}/daily`,
          method: "GET",
          params: { from: "string" },
        },
        { name: "seed_rows", type: "static", path: "data/seed.json" },
      ],
    },
    permissions: ["surface:create", "signal:publish", `net:127.0.0.1`],
  };
  return Buffer.from(
    zipSync({
      "manifest.json": strToU8(JSON.stringify(manifest)),
      "index.html": strToU8("<h1>board</h1>"),
      "data/seed.json": strToU8(JSON.stringify([{ date: "2026-11-01", revenue: 5 }])),
    }),
  );
}

function removeButton(settings: ReturnType<typeof import("@playwright/test").Page["locator"]>, id: string) {
  // The package row carries "<name> <version>" and a Remove button.
  return settings.locator(".vela-list__row", { hasText: id }).getByRole("button", { name: "Remove" });
}

async function initAgent(name: string): Promise<void> {
  await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name, version: "1.0.0" },
  });
  await rpc("notifications/initialized", {});
}

async function openSettings(page: import("@playwright/test").Page): Promise<void> {
  await page.locator(".vela-taskbar .vela-launcher").click();
  const search = page.getByRole("searchbox", { name: "Search applications" });
  await expect(search).toBeVisible();
  await search.fill("settings");
  await search.press("Enter");
}

test.describe("vpk agent declarations", () => {
  test("install with consent, agent calls the http tool, package charts render", async ({ page }) => {
    const api = await startLocalApi();
    const id = `board-e2e-${Date.now()}`;
    await page.goto("/");
    await expect(page.locator(".vela-desktop")).toBeVisible();
    await initAgent(`e2e-agent-${id}`);
    await openSettings(page);
    const settings = page.locator('[data-app-id="settings"]').first();
    await settings.locator('input[type="file"]').setInputFiles({
      name: `${id}.vpk`,
      mimeType: "application/zip",
      buffer: boardPackage(id, api),
    });

    // The consent gate appears BEFORE any install happens.
    const dialog = page.getByRole("dialog", { name: /Grant permissions to Board/ });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Create desktop surfaces");
    await expect(dialog).toContainText("Network access to 127.0.0.1");
    await expect(page.getByText("Package installed")).toHaveCount(0);
    await expect(removeButton(settings, id)).toHaveCount(0);

    await dialog.getByRole("button", { name: "Grant and install" }).click();
    await expect(page.getByText("Package installed")).toBeVisible();

    // Declared surfaces appear under the package owner namespace and wait for data.
    const kpi = page.locator(`.vela-surface-layer [data-window-id="${id}.kpi"]`);
    await expect(kpi).toBeVisible();
    await expect(kpi.locator('[data-waiting="true"]')).toBeVisible();

    // The package tools are registered in the MCP tool table with the id prefix.
    const tools = (await rpc("tools/list", {})).result as { tools: Array<{ name: string }> };
    expect(tools.tools.map((tool) => tool.name)).toContain(`${id}.query_daily`);
    expect(tools.tools.map((tool) => tool.name)).toContain(`${id}.seed_rows`);

    // The static tool returns the bundled resource; no package code runs.
    const seed = await callTool(`${id}.seed_rows`);
    expect(seed.isError).toBeFalsy();
    expect(seed.body.content).toContain("2026-11-01");

    // Calling the http tool publishes rows to the package datasource, which
    // feeds the declared chart surfaces.
    const query = await callTool(`${id}.query_daily`, { params: { from: "2026-11-01" } });
    expect(query.isError).toBeFalsy();
    await expect(kpi.locator(".vela-chart__kpi-value")).toHaveText("18.0");
    await api.close();
  });

  test("denying consent leaves the VFS untouched", async ({ page }) => {
    const api = await startLocalApi();
    const id = `deny-e2e-${Date.now()}`;
    await page.goto("/");
    await initAgent(`e2e-agent-${id}`);
    await openSettings(page);
    const settings = page.locator('[data-app-id="settings"]').first();
    await settings.locator('input[type="file"]').setInputFiles({
      name: `${id}.vpk`,
      mimeType: "application/zip",
      buffer: boardPackage(id, api),
    });

    const dialog = page.getByRole("dialog", { name: /Grant permissions to Board/ });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Deny" }).click();

    await expect(page.getByText("was not installed")).toBeVisible();
    await expect(removeButton(settings, id)).toHaveCount(0);
    // No declared surface was created and no tool was registered.
    const tools = (await rpc("tools/list", {})).result as { tools: Array<{ name: string }> };
    expect(tools.tools.map((tool) => tool.name).some((name) => name.startsWith(`${id}.`))).toBe(false);
    await api.close();
  });

  test("uninstall revokes grants, surfaces and MCP tools", async ({ page }) => {
    const api = await startLocalApi();
    const id = `rm-e2e-${Date.now()}`;
    await page.goto("/");
    await initAgent(`e2e-agent-${id}`);
    await openSettings(page);
    const settings = page.locator('[data-app-id="settings"]').first();
    await settings.locator('input[type="file"]').setInputFiles({
      name: `${id}.vpk`,
      mimeType: "application/zip",
      buffer: boardPackage(id, api),
    });
    const dialog = page.getByRole("dialog", { name: /Grant permissions to Board/ });
    await dialog.getByRole("button", { name: "Grant and install" }).click();
    await expect(page.getByText("Package installed")).toBeVisible();
    await expect(page.locator(`.vela-surface-layer [data-window-id="${id}.kpi"]`)).toBeVisible();

    await removeButton(settings, id).click();
    await expect(page.getByText("Package removed")).toBeVisible();
    await expect(page.locator(`.vela-surface-layer [data-window-id="${id}.kpi"]`)).toHaveCount(0);

    const tools = (await rpc("tools/list", {})).result as { tools: Array<{ name: string }> };
    expect(tools.tools.map((tool) => tool.name).some((name) => name.startsWith(`${id}.`))).toBe(false);
    const gone = await callTool(`${id}.seed_rows`);
    expect(gone.isError).toBe(true);
    await api.close();
  });
});

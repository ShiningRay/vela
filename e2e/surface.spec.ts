import { spawn, type ChildProcess } from "node:child_process";
import { expect, test } from "@playwright/test";

/**
 * Agent surface end-to-end: the service is started here (last spec file, so
 * earlier specs still see the "no service" state they assert) and the desktop
 * page connects to it automatically. Agent actions go through the real MCP
 * HTTP endpoint, exactly as an external agent would drive them.
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
  return JSON.parse(text) as Record<string, unknown>;
}

async function callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = await rpc("tools/call", { name, arguments: args });
  const payload = result.result as { content?: Array<{ text: string }>; isError?: boolean } | undefined;
  return {
    isError: payload?.isError,
    body: JSON.parse(payload?.content?.[0]?.text ?? "{}") as Record<string, unknown>,
  };
}

async function startService(): Promise<void> {
  service = spawn("node", ["services/demo/dist/server.cjs"], {
    cwd: process.cwd(),
    stdio: "ignore",
  });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const health = await fetch("http://127.0.0.1:4317/health");
      if (health.ok) return;
    } catch {
      // Retry until the socket accepts connections.
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

let run = 0;
const unique = (prefix: string): string => `${prefix}-e2e-${Date.now()}-${++run}`;

test.describe("agent surfaces via MCP", () => {
  test("agent creates a chart, pushes data, changes the kind, moves and closes it", async ({ page }) => {
    const id = unique("trend");
    await page.goto("/");
    await expect(page.locator(".vela-desktop")).toBeVisible();

    await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: `e2e-agent-${id}`, version: "1.0.0" },
    });
    await rpc("notifications/initialized", {});

    const created = await callTool("chart.create", {
      id,
      kind: "line",
      title: "E2E Revenue",
      encoding: { x: "date", y: "revenue" },
      dataKey: "daily",
      x: 80,
      y: 100,
      width: 420,
      height: 280,
    });
    expect(created.isError).toBeFalsy();

    const widget = page.locator(`.vela-surface-layer [data-window-id="${id}"]`);
    await expect(widget).toBeVisible();
    // The surface belongs to the agent's owner and is an undecorated widget.
    await expect(widget).toHaveAttribute("data-window-kind", "widget");
    await expect(widget).toHaveAttribute("data-decorated", "false");
    // No data yet: waiting placeholder instead of an empty axis.
    await expect(widget.locator('[data-waiting="true"]')).toBeVisible();
    // Widgets stay out of the taskbar.
    await expect(page.locator(".vela-taskbar__window", { hasText: "E2E Revenue" })).toHaveCount(0);

    const pushed = await callTool("chart.pushData", {
      dataKey: "daily",
      rows: [
        { date: "2026-11-01", revenue: 12 },
        { date: "2026-11-02", revenue: 18 },
      ],
    });
    expect(pushed.isError).toBeFalsy();
    await expect(widget.locator('[data-waiting="true"]')).toHaveCount(0);
    await expect(widget.locator('[data-chart-kind="line"]')).toBeVisible();

    // Changing the chart kind keeps the bound data flowing.
    const patched = await callTool("chart.patch", {
      id,
      spec: { kind: "bar", title: "E2E Revenue", encoding: { x: "date", y: "revenue" } },
    });
    expect(patched.isError).toBeFalsy();
    await expect(widget.locator('[data-chart-kind="bar"]')).toBeVisible();

    // Moving the surface updates its geometry.
    const moved = await callTool("surface.patch", { id, x: 200, y: 240 });
    expect(moved.isError).toBeFalsy();
    await expect
      .poll(() => widget.evaluate((element) => (element as HTMLElement).style.left))
      .toBe("200px");

    const removed = await callTool("surface.remove", { id });
    expect(removed.isError).toBeFalsy();
    await expect(widget).toHaveCount(0);
  });

  test("kpi charts render the value with decimals and units", async ({ page }) => {
    const id = unique("kpi");
    await page.goto("/");
    await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: `e2e-agent-${id}`, version: "1.0.0" },
    });
    await rpc("notifications/initialized", {});
    await callTool("chart.create", {
      id,
      kind: "kpi",
      title: "Revenue today",
      encoding: { value: "revenue" },
      decimals: 1,
      yUnit: "M",
      dataKey: "today",
      x: 40,
      y: 40,
      width: 220,
      height: 120,
    });
    const widget = page.locator(`.vela-surface-layer [data-window-id="${id}"]`);
    await expect(widget).toBeVisible();
    await expect(widget.locator('[data-waiting="true"]')).toBeVisible();

    await callTool("chart.pushData", { dataKey: "today", rows: [{ revenue: 41.75 }] });
    await expect(widget.locator(".vela-chart__kpi-value")).toHaveText("41.8 M");
  });

  test("persisted widgets replay after a reload and ttl surfaces expire", async ({ page }) => {
    const persistedId = unique("persist");
    const ttlId = unique("ttl");
    await page.goto("/");
    await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: `e2e-agent-${persistedId}`, version: "1.0.0" },
    });
    await rpc("notifications/initialized", {});

    await callTool("surface.create", {
      id: persistedId,
      kind: "widget",
      title: "Sticky note",
      x: 20,
      y: 20,
      width: 240,
      height: 120,
      persist: true,
      content: { type: "static", title: "Sticky", body: "survives reloads" },
    });
    await callTool("surface.create", {
      id: ttlId,
      kind: "widget",
      title: "Flash",
      x: 300,
      y: 20,
      width: 200,
      height: 100,
      ttlSeconds: 3,
      content: { type: "static", title: "Flash", body: "gone soon" },
    });

    const sticky = page.locator(`.vela-surface-layer [data-window-id="${persistedId}"]`);
    const flash = page.locator(`.vela-surface-layer [data-window-id="${ttlId}"]`);
    await expect(sticky).toBeVisible();
    await expect(flash).toBeVisible();

    await page.waitForTimeout(3_500);
    await expect(flash).toHaveCount(0);
    await expect(sticky).toBeVisible();

    await page.reload();
    const stickyAfterReload = page.locator(`.vela-surface-layer [data-window-id="${persistedId}"]`);
    await expect(stickyAfterReload).toBeVisible();
    await expect(stickyAfterReload).toContainText("survives reloads");

    await callTool("surface.remove", { id: persistedId });
    await expect(stickyAfterReload).toHaveCount(0);
  });

  test("dashboard.apply commits a whole frame and out-of-namespace writes are forbidden", async ({ page }) => {
    const base = unique("dash");
    await page.goto("/");
    await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: `e2e-agent-${base}`, version: "1.0.0" },
    });
    await rpc("notifications/initialized", {});

    const applied = await callTool("dashboard.apply", {
      batchId: `frame-${base}`,
      operations: [
        {
          tool: "chart.create",
          arguments: { id: `${base}-a`, kind: "kpi", encoding: { value: "v" }, dataKey: "d", x: 20, y: 20 },
        },
        {
          tool: "chart.create",
          arguments: { id: `${base}-b`, kind: "kpi", encoding: { value: "v" }, dataKey: "d", x: 260, y: 20 },
        },
        { tool: "chart.pushData", arguments: { dataKey: "d", rows: [{ v: 7 }] } },
      ],
    });
    expect(applied.isError).toBeFalsy();
    expect(applied.body.batchId).toBe(`frame-${base}`);

    await expect(page.locator(`.vela-surface-layer [data-window-id="${base}-a"] .vela-chart__kpi-value`)).toHaveText("7");
    await expect(page.locator(`.vela-surface-layer [data-window-id="${base}-b"] .vela-chart__kpi-value`)).toHaveText("7");

    const denied = await callTool("vfs.write", { path: "/Surfaces/evil.json", content: "{}" });
    expect(denied.isError).toBe(true);
    expect(denied.body.error).toBe("forbidden");

    const crossOwner = await callTool("signal.publish", { key: "agent.surfaces", value: [] });
    expect(crossOwner.isError).toBe(true);
    expect(crossOwner.body.error).toBe("forbidden");
  });
});

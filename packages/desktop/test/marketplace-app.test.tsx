// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { strToU8, zipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AppRegistry,
  CommandRegistry,
  ConfigStore,
  MemoryVfs,
  NotificationCenter,
  WindowManager,
} from "@vela/core";
import { MarketplaceApp } from "../src/apps/marketplace";
import { DesktopContext, type DesktopServices } from "../src/context";
import { SettingsStore } from "../src/settings";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function archive(files: Record<string, string>): ArrayBuffer {
  const zipped = zipSync(
    Object.fromEntries(Object.entries(files).map(([path, content]) => [path, strToU8(content)])),
  );
  return zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer;
}

const manifest = {
  id: "hello-package",
  name: "Hello Package",
  version: "1.0.0",
  entry: "index.html",
  icon: "H",
};

const plugin = {
  id: "hello-package",
  name: "Hello Package",
  description: "A demo package served by the marketplace.",
  author: "Vela",
  publisherName: "Vela",
  homepage: "https://example.com",
  icon: "H",
  category: "productivity",
  featured: true,
  tags: ["demo"],
  latestVersion: "1.0.0",
  size: 1024,
  downloads: 7,
  rating: 4.5,
  ratingCount: 2,
  updatedAt: "2026-10-01T00:00:00.000Z",
};

function services(): DesktopServices {
  const storage = new Map<string, string>();
  const vfs = new MemoryVfs();
  const config = new ConfigStore(vfs);
  return {
    windows: new WindowManager(),
    apps: new AppRegistry(),
    vfs,
    notifications: new NotificationCenter({ defaultTimeoutMs: 0 }),
    commands: new CommandRegistry(),
    config,
    settings: new SettingsStore(
      {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => {
          storage.set(key, value);
        },
      },
      config,
    ),
  };
}

function renderMarket() {
  const desktop = services();
  render(() => (
    <DesktopContext.Provider value={desktop}>
      <MarketplaceApp />
    </DesktopContext.Provider>
  ));
  return desktop;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("MarketplaceApp", () => {
  it("shows category, rating and featured state, then installs a downloaded VPK", async () => {
    const pkg = archive({
      "manifest.json": JSON.stringify(manifest),
      "index.html": "<h1>Hello</h1>",
    });
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requests.push(url);
        if (url.includes("/download")) {
          return new Response(pkg, { status: 200, headers: { "Content-Type": "application/zip" } });
        }
        return jsonResponse({ items: [plugin], total: 1, page: 1, pageSize: 60 });
      }),
    );

    const desktop = renderMarket();
    await waitFor(() => expect(screen.getByText("Hello Package")).toBeTruthy());

    expect(requests[0]).toContain("/api/plugins?pageSize=60&sort=recent");
    expect(screen.getByText("Featured")).toBeTruthy();
    expect(screen.getByText("★ 4.5 (2)")).toBeTruthy();
    expect(screen.getByText("Vela · Productivity · v1.0.0")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Install" }));

    await waitFor(() => expect(desktop.apps.find("hello-package")?.title).toBe("Hello Package"));
    expect(desktop.vfs.read("/Apps/hello-package/index.html")).toContain("Hello");
    expect(desktop.notifications.items.map((entry) => entry.title)).toContain("Plugin installed");
    expect(screen.getByText("Installed 1.0.0")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reinstall" })).toBeTruthy();
  });

  it("reloads with category and sort filters", async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        requests.push(String(input));
        return jsonResponse({ items: [], total: 0, page: 1, pageSize: 60 });
      }),
    );

    renderMarket();
    await waitFor(() => expect(requests).toHaveLength(1));

    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "finance" } });
    await waitFor(() => expect(requests.some((url) => url.includes("category=finance"))).toBe(true));

    fireEvent.change(screen.getByLabelText("Sort"), { target: { value: "rating" } });
    await waitFor(() => expect(requests.some((url) => url.includes("sort=rating"))).toBe(true));
  });
});

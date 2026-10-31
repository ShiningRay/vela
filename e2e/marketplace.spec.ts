import { strToU8, zipSync } from "fflate";
import { expect, test } from "@playwright/test";

const MARKETPLACE_URL = "http://127.0.0.1:4320";
const ADMIN_TOKEN = "test-admin-token";

function demoPackage(id = "market-demo", name = "Market Demo"): Buffer {
  const manifest = {
    id,
    name,
    version: "1.0.0",
    entry: "index.html",
    icon: "M",
    window: { width: 520, height: 360 },
  };
  const archive = zipSync({
    "manifest.json": strToU8(JSON.stringify(manifest)),
    "index.html": strToU8(
      `<!doctype html><html><body><h1 id="title">${name}</h1><p>Installed from the plugin market.</p></body></html>`,
    ),
  });
  return Buffer.from(archive);
}

test("uploads to the market, searches and installs the VPK", async ({ page, request }) => {
  const upload = await request.post(`${MARKETPLACE_URL}/api/plugins`, {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    multipart: {
      file: {
        name: "market-demo.vpk",
        mimeType: "application/zip",
        buffer: demoPackage(),
      },
      description: "A demo package served by the marketplace.",
      author: "E2E",
      tags: "demo,marketplace",
    },
  });
  expect(upload.status()).toBe(201);

  await page.goto("/");
  await page.getByRole("button", { name: "Plugin Market", exact: true }).dblclick();
  const market = page.locator('[data-app-id="marketplace"]').first();
  await expect(market).toBeVisible();

  await market.getByRole("searchbox", { name: "Search plugins" }).fill("Market Demo");
  await market.getByRole("button", { name: "Search", exact: true }).click();

  const card = market.locator('[data-plugin-id="market-demo"]');
  await expect(card).toBeVisible();
  await expect(card).toContainText("A demo package served by the marketplace.");

  await card.getByRole("button", { name: "Install", exact: true }).click();
  await expect(page.getByText("Plugin installed")).toBeVisible();
  await expect(card.getByText("Installed 1.0.0")).toBeVisible();

  await market.getByTitle("Close").click();
  const icon = page.getByRole("button", { name: "Market Demo", exact: true }).first();
  await expect(icon).toBeVisible();
  await icon.dblclick();
  const frame = page.frameLocator('[data-app-id="market-demo"] iframe');
  await expect(frame.locator("#title")).toHaveText("Market Demo");
});


test("uploads a VPK from the marketplace web page", async ({ page }) => {
  await page.goto(`${MARKETPLACE_URL}/`);
  await expect(page.getByRole("heading", { name: "插件市场" })).toBeVisible();

  await page.locator("#file").setInputFiles({
    name: "market-ui-demo.vpk",
    mimeType: "application/zip",
    buffer: demoPackage("market-ui-demo", "Market UI Demo"),
  });
  await page.locator("#token").fill(ADMIN_TOKEN);
  await page.locator("#description").fill("Uploaded from the marketplace web form.");
  await page.getByRole("button", { name: "上传并上架" }).click();

  await expect(page.getByText("已上架 Market UI Demo v1.0.0")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Market UI Demo" })).toBeVisible();
});

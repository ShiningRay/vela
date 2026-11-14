import { expect, test } from "@playwright/test";
import { strToU8, zipSync } from "fflate";

function appPackage(): Buffer {
  const zip = zipSync({
    "manifest.json": strToU8(
      JSON.stringify({
        id: "hello-package",
        name: "Hello Package",
        version: "1.0.0",
        entry: "index.html",
        icon: "H",
        window: { width: 480, height: 360 },
      }),
    ),
    "index.html": strToU8(
      '<h1 id="title">Hello package</h1><script>console.log("hello from vpk");document.body.dataset.ready="1"</script>',
    ),
    "style.css": strToU8("#title { color: rgb(0, 128, 128); }"),
  });
  return Buffer.from(zip);
}

test("installs a .vpk via file picker, inspects it and runs it", async ({ page }) => {
  await page.goto("http://localhost:5175/");
  await page.setInputFiles('[data-testid="vpk-file-input"]', {
    name: "hello.vpk",
    mimeType: "application/zip",
    buffer: appPackage(),
  });

  await expect(page.getByTestId("vpk-info-id")).toHaveText("hello-package · v1.0.0");

  // Window-size simulation: the run frame follows manifest.window.
  const runFrame = page.getByTestId("vpk-run-frame");
  await expect(runFrame).toBeVisible();
  const box = await runFrame.boundingBox();
  expect(box?.width).toBe(480);
  expect(box?.height).toBe(360);

  const frame = page.frameLocator('[data-testid="vpk-run-iframe"]');
  await expect(frame.locator("#title")).toHaveText("Hello package");

  await expect(page.locator('[data-testid="vpk-installed"] li')).toHaveCount(1);
  await page.getByRole("button", { name: "Uninstall" }).click();
  await expect(page.getByTestId("vpk-info")).toHaveCount(0);
  await expect(page.locator('[data-testid="vpk-installed"] li')).toHaveCount(0);
});

test("rejects an invalid package with the parse error", async ({ page }) => {
  await page.goto("http://localhost:5175/");
  const broken = zipSync({
    "index.html": strToU8("<h1>no manifest</h1>"),
  });
  await page.setInputFiles('[data-testid="vpk-file-input"]', {
    name: "broken.vpk",
    mimeType: "application/zip",
    buffer: Buffer.from(broken),
  });
  await expect(page.locator(".pg-error")).toContainText(/manifest\.json/);
  await expect(page.getByTestId("vpk-installed")).toHaveCount(0);
});

test("installs from a URL (?src=) and runs it", async ({ page }) => {
  await page.route("http://localhost:5175/mock/hello.vpk", (route) =>
    route.fulfill({ body: appPackage(), contentType: "application/zip" }),
  );
  await page.goto("http://localhost:5175/?src=http://localhost:5175/mock/hello.vpk");
  await expect(page.getByTestId("vpk-info-id")).toHaveText("hello-package · v1.0.0");
  await expect(page.frameLocator('[data-testid="vpk-run-iframe"]').locator("#title")).toHaveText(
    "Hello package",
  );
});

test("debug mode forwards package console output through the bridge", async ({ page }) => {
  await page.goto("http://localhost:5175/");
  await page.getByTestId("vpk-debug-toggle").locator("input").check();
  await page.setInputFiles('[data-testid="vpk-file-input"]', {
    name: "hello.vpk",
    mimeType: "application/zip",
    buffer: appPackage(),
  });
  const consolePanel = page.getByTestId("vpk-console");
  await expect(consolePanel).toBeVisible();
  await expect(consolePanel.locator(".pg-log-line[data-level='log']")).toContainText(
    "hello from vpk",
  );
});

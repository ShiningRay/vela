import { expect, test, type Page } from "@playwright/test";
import { strToU8, zipSync } from "fflate";

async function openFromLauncher(page: Page, query: string): Promise<void> {
  await page.locator(".vela-taskbar .vela-launcher").click();
  const search = page.getByRole("searchbox", { name: "Search applications" });
  await expect(search).toBeVisible();
  await search.fill(query);
  await search.press("Enter");
}

async function openSettingsFromMenu(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Desktop", exact: true }).click();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
}

function appPackage(): Buffer {
  const zip = zipSync({
    "manifest.json": strToU8(
      JSON.stringify({
        id: "hello-package",
        name: "Hello Package",
        version: "1.0.0",
        entry: "index.html",
        icon: "H",
      }),
    ),
    "index.html": strToU8(
      '<link rel="stylesheet" href="./style.css"><h1 id="title">Hello package</h1><script>document.body.dataset.ready="1"</script>',
    ),
    "style.css": strToU8("#title { color: rgb(0, 128, 128); }"),
  });
  return Buffer.from(zip);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".vela-desktop")).toBeVisible();
});

test("persistent VFS imports, exports and survives reload", async ({ page }) => {
  await openFromLauncher(page, "files");
  const files = page.locator('[data-app-id="files"]').first();
  const input = files.locator('input[type="file"]');

  await input.setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello from e2e"),
  });
  const note = files.getByRole("option", { name: /notes.txt/ });
  await expect(note).toBeVisible();
  await note.click();
  await expect(files.locator(".vela-file-preview")).toHaveText("hello from e2e");

  const downloadPromise = page.waitForEvent("download");
  await files.getByRole("button", { name: "Export" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("notes.txt");

  await page.waitForTimeout(500);
  await page.reload();
  await openFromLauncher(page, "files");
  await expect(page.getByRole("option", { name: /notes.txt/ })).toBeVisible();
});

test("settings persist accent, wallpaper and custom hotkeys", async ({ page }) => {
  await openFromLauncher(page, "settings");
  const settings = page.locator('[data-app-id="settings"]').first();

  await settings.getByRole("button", { name: "Use color #f472b6" }).click();
  await settings.getByLabel("Wallpaper").selectOption("sunset");
  await settings.getByLabel("Launcher").fill("Alt+Shift+L");

  await expect
    .poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue("--vela-color-accent")))
    .toBe("#f472b6");

  await page.waitForTimeout(300);
  await page.reload();
  await openSettingsFromMenu(page);

  const restored = page.locator('[data-app-id="settings"]').first();
  await expect(restored.getByRole("button", { name: "Use color #f472b6" })).toHaveAttribute(
    "data-active",
    "true",
  );
  await expect(restored.getByLabel("Wallpaper")).toHaveValue("sunset");
  await expect(restored.getByLabel("Launcher")).toHaveValue("Alt+Shift+L");

  await page.keyboard.press("Alt+Shift+L");
  await expect(page.getByRole("dialog", { name: "Application launcher" })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("Editor and Terminal share the persistent VFS", async ({ page }) => {
  await openFromLauncher(page, "editor");
  const editor = page.locator('[data-app-id="editor"]').first();
  await editor.getByLabel("File path").fill("/Documents/editor.txt");
  await editor.getByLabel("Editor content").fill("written by Editor");
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(editor.getByText("Saved", { exact: true })).toBeVisible();

  await openFromLauncher(page, "terminal");
  const terminal = page.locator('[data-app-id="terminal"]').first();
  await terminal.getByLabel("Terminal command").fill("cat /Documents/editor.txt");
  await terminal.getByLabel("Terminal command").press("Enter");
  await expect(terminal.locator(".vela-terminal-output")).toContainText("written by Editor");

  await terminal.getByLabel("Terminal command").fill("touch /Documents/term.txt");
  await terminal.getByLabel("Terminal command").press("Enter");
  await terminal.getByLabel("Terminal command").fill("ls /Documents");
  await terminal.getByLabel("Terminal command").press("Enter");
  await expect(terminal.locator(".vela-terminal-output")).toContainText("term.txt");
});

test("installs a .vpk package, launches its sandboxed entry and restores it", async ({ page }) => {
  await openFromLauncher(page, "settings");
  const settings = page.locator('[data-app-id="settings"]').first();
  await settings.locator('input[type="file"]').setInputFiles({
    name: "hello.vpk",
    mimeType: "application/zip",
    buffer: appPackage(),
  });

  await expect(page.getByText("Package installed")).toBeVisible();
  await settings.getByTitle("Close").click();

  const icon = page.getByRole("button", { name: /Hello Package/ }).first();
  await expect(icon).toBeVisible();
  await icon.dblclick();

  const frame = page.frameLocator('[data-app-id="hello-package"] iframe');
  await expect(frame.locator("#title")).toHaveText("Hello package");
  await expect(frame.locator("body[data-ready='1']")).toBeVisible();
  await expect
    .poll(() => frame.locator("#title").evaluate((element) => getComputedStyle(element).color))
    .toBe("rgb(0, 128, 128)");

  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.getByRole("button", { name: /Hello Package/ }).first()).toBeVisible();
});

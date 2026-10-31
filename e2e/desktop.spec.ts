import { expect, test, type Page } from "@playwright/test";

async function openFromLauncher(page: Page, query: string): Promise<void> {
  await page.keyboard.press("Meta+Space");
  const search = page.getByRole("searchbox", { name: "Search applications" });
  await expect(search).toBeVisible();
  await expect(search).toBeFocused();
  await search.fill(query);
  await search.press("Enter");
}

async function openFromMenu(page: Page, label: string): Promise<void> {
  await page.getByRole("button", { name: "Desktop", exact: true }).click();
  await page.getByRole("menuitem", { name: label, exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".vela-desktop")).toBeVisible();
});

test("launcher searches with the keyboard and opens multiple app instances", async ({ page }) => {
  await page.keyboard.press("Meta+Space");
  const search = page.getByRole("searchbox", { name: "Search applications" });
  await expect(search).toBeFocused();
  await search.fill("ser");
  await expect(page.getByRole("option")).toHaveCount(1);
  await expect(page.getByRole("option")).toContainText("Service");

  await search.fill("files");
  await expect(page.getByRole("option")).toHaveCount(1);
  await search.press("Enter");

  await expect(page.locator('[data-app-id="files"]')).toHaveCount(1);
  await openFromLauncher(page, "files");
  await expect(page.locator('[data-app-id="files"]')).toHaveCount(2);
  await expect(page.locator(".vela-taskbar__window")).toHaveText(["Files", "Files 2"]);
});

test("launcher toggles from the taskbar and closes on an outside click", async ({ page }) => {
  const search = page.getByRole("searchbox", { name: "Search applications" });
  const taskbarLauncher = page.getByRole("button", { name: "Vela", exact: true }).last();

  await taskbarLauncher.click();
  await expect(search).toBeVisible();
  await taskbarLauncher.click();
  await expect(search).toHaveCount(0);

  await taskbarLauncher.click();
  await expect(search).toBeVisible();
  await page.locator(".vela-desktop").click({ position: { x: 900, y: 400 } });
  await expect(search).toHaveCount(0);
});

test("service app renders the supervisor URL, health and log panel", async ({ page }) => {
  await openFromLauncher(page, "service");
  await expect(page.getByText("Service log", { exact: true })).toBeVisible();
  await expect(page.getByText("No service logs yet.")).toBeVisible();
  await expect(page.getByText("ws://127.0.0.1:4317")).toBeVisible();
});

test("dragging to the edges previews and applies left, right and top snaps", async ({ page }) => {
  await openFromLauncher(page, "files");
  const win = page.locator('[data-app-id="files"]').first();
  await expect(win).toBeVisible();

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const width = viewport!.width;
  const height = viewport!.height - 78;

  const dragTo = async (x: number, y: number, zone: string): Promise<void> => {
    const bar = win.locator(".vela-window__titlebar");
    const box = await bar.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + 40, box!.y + 12);
    await page.mouse.down();
    await page.mouse.move(x, y, { steps: 8 });
    const preview = page.locator(".vela-snap-preview");
    await expect(preview).toHaveAttribute("data-zone", zone);
    await page.mouse.up();
    await expect(preview).toHaveCount(0);
  };

  await dragTo(3, 300, "left");
  await expect.poll(() => win.evaluate((element) => (element as HTMLElement).style.left)).toBe("0px");
  await expect.poll(() => win.evaluate((element) => (element as HTMLElement).style.width)).toBe(
    `${Math.round(width / 2)}px`,
  );

  await dragTo(width - 3, 300, "right");
  await expect.poll(() => win.evaluate((element) => (element as HTMLElement).style.left)).toBe(
    `${Math.round(width / 2)}px`,
  );

  await dragTo(Math.round(width / 2), 3, "top");
  await expect(win).toHaveAttribute("data-maximized", "true");
  await expect.poll(() => win.evaluate((element) => (element as HTMLElement).style.height)).toBe(
    `${height}px`,
  );
});

test("resizes, maximizes and restores with z-order focus", async ({ page }) => {
  await openFromLauncher(page, "files");
  const files = page.locator('[data-app-id="files"]').first();
  await expect(files).toBeVisible();
  const viewport = page.viewportSize()!;
  const before = await files.boundingBox();
  expect(before).not.toBeNull();

  const handle = files.locator(".vela-window__resize");
  const handleBox = await handle.boundingBox();
  expect(handleBox).not.toBeNull();
  await page.mouse.move(handleBox!.x + 7, handleBox!.y + 7);
  await page.mouse.down();
  await page.mouse.move(handleBox!.x + 107, handleBox!.y + 87, { steps: 6 });
  await page.mouse.up();

  const after = await files.boundingBox();
  expect(after!.width).toBeGreaterThan(before!.width + 80);
  expect(after!.height).toBeGreaterThan(before!.height + 60);

  await openFromLauncher(page, "about");
  const about = page.locator('[data-app-id="about"]');
  await expect(about).toHaveAttribute("data-active", "true");

  await files.locator(".vela-window__titlebar").click();
  await expect(files).toHaveAttribute("data-active", "true");
  await expect(about).toHaveAttribute("data-active", "false");

  await files.locator(".vela-window__titlebar").dblclick();
  await expect(files).toHaveAttribute("data-maximized", "true");
  await expect
    .poll(() => files.evaluate((element) => (element as HTMLElement).style.width))
    .toBe(`${viewport.width}px`);
  await expect
    .poll(() => files.evaluate((element) => (element as HTMLElement).style.height))
    .toBe(`${viewport.height - 78}px`);

  await files.locator(".vela-window__titlebar").dblclick();
  await expect(files).toHaveAttribute("data-maximized", "false");
});

test("minimizing animates the window and keeps the taskbar in sync", async ({ page }) => {
  await openFromLauncher(page, "files");
  const win = page.locator('[data-app-id="files"]').first();
  const task = page.locator(".vela-taskbar__window").first();

  await win.getByTitle("Minimize").click();
  await expect(win).toHaveAttribute("data-minimized", "true");
  await expect(task).toHaveAttribute("data-minimized", "true");
  await expect(win).toHaveCSS("visibility", "hidden");

  await task.click();
  await expect(win).toHaveAttribute("data-minimized", "false");
  await expect(task).toHaveAttribute("data-minimized", "false");
  await expect(win).toHaveCSS("visibility", "visible");
});

test("menu bar dropdown opens apps", async ({ page }) => {
  await page.getByRole("button", { name: "Desktop", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Open Launcher", exact: false })).toBeVisible();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();

  await expect(page.locator('[data-app-id="settings"]')).toBeVisible();
  await expect(page.locator(".vela-menubar__app")).toHaveText("Settings");
});

test("notifications stack and auto-dismiss", async ({ page }) => {
  await openFromMenu(page, "Settings");
  const notify = page.getByRole("button", { name: "Test notification" });
  for (let index = 0; index < 4; index += 1) await notify.click();

  await expect(page.locator(".vela-notification")).toHaveCount(3);
  await expect(page.locator(".vela-notification")).toHaveCount(0, { timeout: 8_000 });
});

test("desktop blur drops the active window and focus restores it", async ({ page }) => {
  await openFromLauncher(page, "about");
  const desktop = page.locator(".vela-desktop");
  const win = page.locator('[data-app-id="about"]');

  await expect(win).toHaveAttribute("data-active", "true");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(desktop).toHaveAttribute("data-desktop-focused", "false");
  await expect(win).toHaveAttribute("data-active", "false");
  await expect(page.locator(".vela-menubar__app")).toHaveText("Desktop");

  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(desktop).toHaveAttribute("data-desktop-focused", "true");
  await expect(win).toHaveAttribute("data-active", "true");
  await expect(page.locator(".vela-menubar__app")).toHaveText("About Vela");
});

test("hotkey center closes, minimizes and quits windows", async ({ page }) => {
  await openFromLauncher(page, "files");
  await openFromLauncher(page, "files");
  await expect(page.locator(".vela-window")).toHaveCount(2);

  await page.keyboard.press("Meta+W");
  await expect(page.locator(".vela-window")).toHaveCount(1);

  await page.keyboard.press("Meta+M");
  await expect(page.locator(".vela-window")).toHaveAttribute("data-minimized", "true");

  await page.keyboard.press("Meta+Q");
  await expect(page.locator(".vela-window")).toHaveCount(0);
});

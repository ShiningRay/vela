import { expect, test } from "@playwright/test";

test("component gallery renders every section", async ({ page }) => {
  await page.goto("http://localhost:5174/");

  for (const title of ["Primitives", "Feedback", "Layout", "Data", "Desktop"]) {
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  }

  await expect(page.getByLabel("Project name")).toBeVisible();
  await expect(page.getByRole("listbox", { name: "Files" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Inspect" })).toBeVisible();
  await expect(page.getByLabel("Due date")).toBeVisible();
});

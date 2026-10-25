import { test, expect } from "@playwright/test";
import { defaults } from "../../src/core/settings";
test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    (value) => {
      if (!localStorage.getItem("ai-workspace.preferences.v1"))
        localStorage.setItem(
          "ai-workspace.preferences.v1",
          JSON.stringify(value),
        );
    },
    { ...defaults, demo: true },
  );
});
test("office renders, animates, selects teammates and contains no remote requests", async ({
  page,
}) => {
  const errors: string[] = [];
  const remote: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (
      /^https?:/.test(r.url()) &&
      !r.url().startsWith("http://127.0.0.1:4174")
    )
      remote.push(r.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "The office", exact: true }),
  ).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByText("4 simulated sessions")).toBeVisible();
  await page.getByRole("button", { name: "Pause demo", exact: true }).click();
  await page.waitForTimeout(7000);
  const first = await page.locator("canvas").screenshot();
  await expect
    .poll(
      async () => {
        const nextFrame = await page.locator("canvas").screenshot();
        return !first.equals(nextFrame);
      },
      { timeout: 5000, intervals: [120, 230, 330] },
    )
    .toBe(true);
  await page
    .getByRole("button", { name: "Inspect Claude", exact: true })
    .click();
  await expect(page.locator(".detail-identity h3")).toHaveText("Claude");
  await expect(page.getByText("Verified tokens")).toBeVisible();
  await expect(
    page.locator("dd").filter({ hasText: "Unavailable" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Advance demo state", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Inspect Claude", exact: true }),
  ).toContainText("Reading documents");
  await page
    .getByRole("button", { name: "Choose blue outfit", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Choose blue outfit", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Assign workstation").selectOption("desk-4");
  await expect(page.getByLabel("Assign workstation")).toHaveValue("desk-4");
  await page.screenshot({
    path: "docs/screenshots/office.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  expect(remote).toEqual([]);
});
test("saved settings survive reload; live mode never shows fake sessions", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open settings", exact: true })
    .click();
  await page.getByLabel("Frame rate").selectOption("30");
  await page.getByLabel("Office palette").selectOption("dusk");
  await page
    .getByRole("switch", { name: "Reduced motion", exact: true })
    .check();
  await expect(page.locator(".saved-note")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Open settings", exact: true })
    .click();
  await expect(page.getByLabel("Frame rate")).toHaveValue("30");
  await expect(page.getByLabel("Office palette")).toHaveValue("dusk");
  await expect(
    page.getByRole("switch", { name: "Reduced motion", exact: true }),
  ).toBeChecked();
  await page.getByRole("switch", { name: "Demo mode", exact: true }).uncheck();
  await page.getByRole("button", { name: "Office", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your team hasn’t arrived yet" }),
  ).toBeVisible();
  await expect(page.locator(".agent-row")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".agent-row")).toHaveCount(0);
  await page.getByRole("button", { name: "Try the demo", exact: true }).click();
  await expect(page.locator(".agent-row")).toHaveCount(4);
});
test("office furniture can be dragged and persists", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Customize", exact: true }).click();
  await page.waitForTimeout(500);
  const canvas = page.locator("canvas");
  const box = (await canvas.boundingBox())!;
  const scale = Math.min(box.width / 512, box.height / 368);
  const offsetX = box.x + (box.width - 512 * scale) / 2,
    offsetY = box.y + (box.height - 368 * scale) / 2;
  await page.mouse.move(offsetX + 140 * scale, offsetY + 150 * scale);
  await page.mouse.down();
  await page.mouse.move(offsetX + 156 * scale, offsetY + 158 * scale, {
    steps: 12,
  });
  await page.mouse.up();
  await expect(page.getByRole("status")).toContainText(
    "Workstation moved and saved.",
  );
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("ai-workspace.preferences.v1")!),
  );
  expect(stored.furniture[0].x).toBe(120);
  expect(stored.furniture[0].y).toBe(136);
  await page.reload();
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("ai-workspace.preferences.v1")!),
  );
  expect(after.furniture[0].x).toBe(120);
});
test("sessions, activity, connection availability and diagnostics work", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sessions", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await page.getByLabel("Filter sessions").selectOption("waiting");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(page.locator(".timeline-row").first()).toBeVisible();
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(
    page.getByText("Desktop required", { exact: true }).last(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open settings", exact: true })
    .click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export diagnostics", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("ai-workspace-diagnostics.json");
});
test("narrow layouts retain controls without horizontal document overflow", async ({
  page,
}) => {
  for (const width of [1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.locator("canvas")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Customize", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: "docs/screenshots/office-" + width + ".png",
      fullPage: true,
    });
  }
});

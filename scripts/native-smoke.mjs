// Opt-in smoke test of an already running WebView2 desktop build.
// See https://playwright.dev/docs/webview2. No native preferences are changed.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const endpoint =
  process.env.AI_WORKSPACE_CDP_ENDPOINT ?? "http://127.0.0.1:9223";
const browser = await chromium.connectOverCDP(endpoint, { timeout: 15000 });
const context = browser.contexts()[0];
const page =
  context.pages().find((p) => /tauri\.localhost|tauri:\/\//.test(p.url())) ??
  context.pages()[0];
assert(page, "No desktop WebView2 page found");
await page
  .getByRole("heading", { name: "The office", exact: true })
  .waitFor({ timeout: 15000 });
await page.locator("canvas").waitFor();
assert.equal(await page.locator(".agent-row").count(), 4);
assert.match(await page.locator(".statusbar").innerText(), /Windows desktop/);
const nativeSettings = await page.evaluate(() =>
  window.__TAURI_INTERNALS__.invoke("load_preferences"),
);
assert(nativeSettings === null || nativeSettings.version === 1);
const pauseButton = page.getByRole("button", {
  name: "Pause demo",
  exact: true,
});
if (await pauseButton.count()) await pauseButton.click();
await page.getByRole("button", { name: "Inspect Claude", exact: true }).click();
assert.equal(await page.locator(".detail-identity h3").innerText(), "Claude");
await page
  .getByRole("button", { name: "Advance demo state", exact: true })
  .click();
await page.getByRole("button", { name: "Open settings", exact: true }).click();
assert.equal(await page.getByLabel("Frame rate").inputValue(), "60");
await page.getByRole("button", { name: "Office", exact: true }).click();
await page.waitForTimeout(8000);
const output =
  process.env.AI_WORKSPACE_SMOKE_OUTPUT ??
  path.resolve("docs/screenshots/native-office.png");
await mkdir(path.dirname(output), { recursive: true });
await page.screenshot({ path: output, fullPage: true });
const report = {
  runtime: "Tauri 2 + WebView2",
  rendered: true,
  sessionCount: 4,
  nativePreferenceRead: true,
  teammateInspection: true,
  demoStateAdvance: true,
  settingsNavigation: true,
  preferencesWritten: false,
};
await writeFile(
  output.replace(/\.png$/, ".json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
await browser.close();

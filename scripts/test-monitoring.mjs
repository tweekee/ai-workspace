import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const root = process.cwd(),
  desktop = process.argv.includes("--desktop");
const executable = path.resolve(
  process.env.AI_WORKSPACE_TEST_EXE ??
    "src-tauri/target/debug/ai-workspace.exe",
);
const temporaryRoot = path.resolve(root, "test-results/monitoring-runtime");
await mkdir(temporaryRoot, { recursive: true });
const directory = await mkdtemp(path.join(temporaryRoot, "run-"));
const env = {
  ...process.env,
  AI_WORKSPACE_DATA_DIR: directory,
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=9223",
  WEBVIEW2_USER_DATA_FOLDER: path.join(directory, "webview"),
};
const child = spawn(executable, desktop ? [] : ["--monitor-server"], {
  env,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "",
  errors = "";
child.stdout.on("data", (b) => {
  output += b;
});
child.stderr.on("data", (b) => {
  errors += b;
});
let context,
  webview,
  report = {};
const until = async (check, label, timeout = 15000) => {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      const value = await check();
      if (value) return value;
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw Error(label + " timed out" + (last ? ": " + last.message : ""));
};
const base = "http://127.0.0.1:38471";
try {
  await until(async () => {
    const r = await fetch(base + "/health");
    return r.ok;
  }, "Native bridge startup");
  const credentials = JSON.parse(
    await readFile(path.join(directory, "bridge-credentials.json"), "utf8"),
  );
  const snapshot = async () => {
    const r = await fetch(base + "/v1/snapshot", {
      headers: { Authorization: "Bearer " + credentials.hookToken },
    });
    assert.equal(r.status, 200);
    return r.json();
  };
  let pairCode;
  if (desktop) {
    webview = await chromium.connectOverCDP("http://127.0.0.1:9223");
    const page = webview.contexts()[0].pages()[0];
    await page
      .getByRole("heading", { name: "The office", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    await page
      .getByRole("button", { name: "Generate pairing code", exact: true })
      .click();
    pairCode = (await page.locator(".pairing-code code").innerText()).trim();
    report.nativePairingUI = true;
  } else {
    pairCode = await until(() => {
      const line = output.split(/\r?\n/).find((l) => l.startsWith('{"'));
      return line && JSON.parse(line).pairCode;
    }, "Pair code");
  }
  const denied = await fetch(base + "/v1/browser", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://chatgpt.com",
    },
    body: JSON.stringify({ observations: [] }),
  });
  assert.equal(denied.status, 401);
  context = await chromium.launchPersistentContext(
    path.join(directory, "chrome"),
    {
      channel: "chromium",
      headless: true,
      args: [
        "--disable-extensions-except=" + path.join(root, "browser-extension"),
        "--load-extension=" + path.join(root, "browser-extension"),
      ],
      ...(process.env.AI_WORKSPACE_CHROMIUM
        ? { executablePath: process.env.AI_WORKSPACE_CHROMIUM }
        : {}),
    },
  );
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent("serviceworker");
  const extensionId = new URL(worker.url()).host;
  const popup = await context.newPage();
  await popup.goto("chrome-extension://" + extensionId + "/popup.html");
  await popup.locator("#code").fill(pairCode);
  await popup.getByRole("button", { name: "Pair", exact: true }).click();
  await until(async () => {
    const message = await popup.locator("#status").innerText();
    if (/Connected locally|Paired/.test(message)) return true;
    throw Error(message);
  }, "Extension pairing");
  const html = {
    chatgpt:
      '<!doctype html><main><div id="prompt-textarea" contenteditable="true" role="textbox">Fixture composer</div></main>',
    claude:
      '<!doctype html><main><div contenteditable="true" role="textbox">Fixture composer</div></main>',
    gemini:
      '<!doctype html><main><rich-textarea><div contenteditable="true">Fixture composer</div></rich-textarea></main>',
  };
  const urls = {
    chatgpt: "https://chatgpt.com/ai-workspace-fixture",
    claude: "https://claude.ai/ai-workspace-fixture",
    gemini: "https://gemini.google.com/ai-workspace-fixture",
  };
  const pages = [];
  for (const provider of ["chatgpt", "chatgpt", "claude", "gemini"]) {
    const page = await context.newPage();
    await page.route("**/*", (route) =>
      route.request().url().startsWith(urls[provider])
        ? route.fulfill({
            status: 200,
            contentType: "text/html",
            body: html[provider],
          })
        : route.abort(),
    );
    await page.goto(urls[provider]);
    pages.push({ provider, page });
  }
  await until(async () => {
    const s = await snapshot();
    return (
      s.sessions.filter((a) => a.source === "browser" && a.state === "idle")
        .length === 4
    );
  }, "Four independent browser sessions");
  assert.equal(new Set((await snapshot()).sessions.map((a) => a.id)).size, 4);
  for (const { provider, page } of pages) {
    const before = (await snapshot()).sessions.filter(
      (s) => s.state === "working",
    ).length;
    await page.evaluate((p) => {
      const b = document.createElement("button");
      b.id = "test-stop";
      if (p === "chatgpt") b.dataset.testid = "stop-button";
      if (p === "claude") b.setAttribute("aria-label", "Stop response");
      if (p === "gemini") b.setAttribute("data-test-id", "stop-button");
      b.textContent = "Stop";
      document.querySelector("main").append(b);
    }, provider);
    await until(async () => {
      const s = await snapshot();
      return (
        s.sessions.filter((a) => a.state === "working").length === before + 1
      );
    }, provider + " visible generation");
    await page.evaluate((p) => {
      const d = document.createElement("div");
      d.id = "test-approval";
      if (p === "chatgpt") d.dataset.testid = "confirmation-dialog";
      if (p === "claude") d.dataset.testid = "tool-approval";
      if (p === "gemini") d.setAttribute("data-test-id", "tool-confirmation");
      d.innerHTML = "<button>Approve fixture tool</button>";
      document.querySelector("main").append(d);
    }, provider);
    await until(async () => {
      const s = await snapshot();
      return s.sessions.some(
        (a) => a.provider === provider && a.state === "waiting",
      );
    }, provider + " visible approval");
    await page.evaluate(() => {
      document.querySelector("#test-approval").remove();
      document.querySelector("#test-stop").remove();
    });
    await until(async () => {
      const s = await snapshot();
      return !s.sessions.some(
        (a) => a.provider === provider && a.state === "waiting",
      );
    }, provider + " returns idle");
  }
  report.extension = {
    loaded: true,
    pairing: true,
    simultaneousTabs: 4,
    providers: ["chatgpt", "claude", "gemini"],
    states: ["idle", "working", "waiting"],
    testSource:
      "local DOM fixtures at supported URL origins; no provider model requests",
  };
  if (desktop) {
    const page = webview.contexts()[0].pages()[0];
    await page.getByRole("button", { name: "Office", exact: true }).click();
    await until(
      async () => (await page.locator(".agent-row").count()) === 4,
      "Native office browser sessions",
    );
    assert.equal(
      await page.locator(".mode-tag").innerText(),
      "Live monitoring",
    );
    assert.equal(await page.locator("canvas").count(), 1);
    report.nativeOffice = {
      realCharacters: 4,
      liveSidebar: true,
      simulated: false,
      inputSource: "provider DOM fixtures and hook contract fixtures",
    };
  }
  const firstId = (await snapshot()).sessions.find(
    (s) => s.provider === "chatgpt",
  ).id;
  await pages[0].page.close();
  await until(async () => {
    const s = await snapshot();
    return s.sessions.some((a) => a.id === firstId && a.state === "offline");
  }, "Closed tab disconnect");
  report.extension.states.push("offline");
  const sendHook = async (
    provider,
    event,
    session = "fixture-" + provider,
    extra = {},
  ) => {
    const input = {
      ...extra,
      session_id: session,
      hook_event_name: event,
      tool_name: provider === "gemini" ? "run_shell_command" : "Bash",
      cwd: "C:/private-fixture/verification-project",
      prompt: "PRIVATE FIXTURE PROMPT",
      tool_input: { command: "PRIVATE FIXTURE COMMAND" },
      transcript_path: "C:/never-read-fixture-transcript",
    };
    const reporter = spawn(executable, ["--report-hook", provider], {
      env,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let text = "";
    reporter.stdout.on("data", (b) => (text += b));
    reporter.stdin.end(JSON.stringify(input));
    const code = await new Promise((resolve, reject) => {
      reporter.on("error", reject);
      reporter.on("exit", resolve);
    });
    assert.equal(code, 0);
    assert.equal(text.trim(), "{}");
  };
  for (const provider of ["codex", "claude", "gemini"]) {
    await sendHook(provider, "SessionStart");
    await until(
      async () =>
        (await snapshot()).sessions.some(
          (s) =>
            s.source === "local" &&
            s.provider === provider &&
            s.state === "idle",
        ),
      provider + " hook startup",
    );
    await sendHook(
      provider,
      provider === "gemini" ? "BeforeTool" : "PreToolUse",
    );
    await until(
      async () =>
        (await snapshot()).sessions.some(
          (s) =>
            s.source === "local" &&
            s.provider === provider &&
            s.state === "working" &&
            s.task === "terminal",
        ),
      provider + " hook tool state",
    );
    await sendHook(provider, "Notification"); // unknown notifications do not fabricate activity
    {
      if (provider === "gemini")
        await sendHook(provider, "Notification", "fixture-" + provider, {
          notification_type: "ToolPermission",
        });
      else await sendHook(provider, "PermissionRequest");
      await until(
        async () =>
          (await snapshot()).sessions.some(
            (s) =>
              s.source === "local" &&
              s.provider === provider &&
              s.state === "waiting",
          ),
        provider + " hook approval",
      );
    }
  }
  const metadata = JSON.stringify(await snapshot());
  assert(!metadata.includes("PRIVATE FIXTURE"));
  assert(!metadata.includes("private-fixture"));
  assert(!metadata.includes("transcript_path"));
  report.cli = {
    providers: ["codex", "claude", "gemini"],
    reporterExecutable: true,
    hookContracts: true,
    privacyFiltering: true,
    verification:
      "provider hook-contract fixtures; not inference or installed CLI runtime",
  };
  if (desktop) {
    const page = webview.contexts()[0].pages()[0];
    await until(
      async () => (await page.locator(".agent-row").count()) === 7,
      "Multiple native real sessions",
    );
    await page
      .getByRole("button", { name: "Inspect Codex", exact: true })
      .click();
    assert.match(
      await page.locator(".agent-details").innerText(),
      /CLI · real/,
    );
    await page.waitForTimeout(7000);
    await mkdir("docs/screenshots", { recursive: true });
    await page.screenshot({
      path: "docs/screenshots/real-monitoring-native.png",
      fullPage: true,
    });
    report.nativeOffice.sessionRows = 7;
  }
  for (const provider of ["codex", "claude", "gemini"])
    await sendHook(provider, "SessionEnd");
  await until(
    async () =>
      (await snapshot()).sessions
        .filter((s) => s.source === "local")
        .every((s) => s.state === "offline"),
    "CLI session closure",
  );
  if (process.argv.includes("--live-sites")) {
    const beforeIds = new Set((await snapshot()).sessions.map((a) => a.id));
    const sites = [
      "https://chatgpt.com/",
      "https://claude.ai/",
      "https://gemini.google.com/",
    ];
    const livePages = await Promise.all(
      sites.map(async (url) => {
        const page = await context.newPage();
        let navigation = true;
        try {
          await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 30000,
          });
        } catch {
          navigation = false;
        }
        return { page, navigation };
      }),
    );
    await new Promise((r) => setTimeout(r, 10000));
    const observed = (await snapshot()).sessions.filter(
      (a) => a.source === "browser" && !beforeIds.has(a.id),
    );
    report.liveSites = {
      mode: "fresh unauthenticated Chromium profile; no prompt sent",
      observations: observed.map((a) => ({
        provider: a.provider,
        state: a.state,
        evidence: a.evidence,
      })),
      loadedPages: livePages.filter((p) => p.navigation).length,
      limitation:
        "Only the currently visible unauthenticated page state was checked; authenticated generation/approval remains unverified",
    };
    for (const { page } of livePages) await page.close();
  }
  report.http = { authentication: true, webOriginRejected: true };
  report.llmRequests = 0;
  const out =
    process.env.AI_WORKSPACE_MONITOR_REPORT ??
    "docs/monitoring-fixture-verification.json";
  await writeFile(out, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  try {
    const c = JSON.parse(
      await readFile(path.join(directory, "bridge-credentials.json"), "utf8"),
    );
    console.error("PAIR DIAGNOSTIC", { pairedBrowsers: c.browsers.length });
    if (context) {
      const p = context.pages().find((p) => p.url().includes("popup.html"));
      if (p) console.error("POPUP", await p.locator("body").innerText());
    }
  } catch {}
  throw error;
} finally {
  if (context) await context.close().catch(() => {});
  if (webview) await webview.close().catch(() => {});
  child.kill();
  await new Promise((r) => setTimeout(r, 500));
  // This is a uniquely created temporary directory, never a supplied project path.
  if (path.resolve(directory).startsWith(temporaryRoot + path.sep))
    await rm(directory, { recursive: true, force: true }).catch(() => {});
  if (errors) console.error(errors.slice(-1200));
}

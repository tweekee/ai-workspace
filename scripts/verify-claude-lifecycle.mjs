// Optional installed-runtime probe. No user messages/model turns are sent.
import { spawn } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const directory = path.resolve("test-results/claude-lifecycle"),
  project = path.join(directory, "project");
await mkdir(path.join(project, ".claude"), { recursive: true });
const workspace = path.resolve(
  process.env.AI_WORKSPACE_TEST_EXE ??
    "src-tauri/target/debug/ai-workspace.exe",
);
const claude = process.env.AI_WORKSPACE_CLAUDE_EXE;
if (!claude)
  throw Error("Set AI_WORKSPACE_CLAUDE_EXE to the installed claude.exe");
const settings = path.join(project, ".claude/settings.local.json");
await writeFile(
  settings,
  JSON.stringify({
    hooks: {
      SessionStart: [
        {
          hooks: [
            {
              type: "command",
              command: workspace,
              args: ["--report-hook", "claude"],
              timeout: 3,
            },
          ],
        },
      ],
    },
  }),
);
const env = {
  ...process.env,
  AI_WORKSPACE_DATA_DIR: directory,
  CLAUDE_CONFIG_DIR: path.join(directory, "profile"),
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
  ANTHROPIC_BASE_URL: "http://127.0.0.1:9",
  ANTHROPIC_API_KEY: "local-lifecycle-test-no-credential",
};
const server = spawn(workspace, ["--monitor-server"], {
  env,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.resume();
server.stderr.resume();
const wait = async (check, label, ms = 20000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const v = await check();
      if (v) return v;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw Error(label + " timed out");
};
const agents = [];
let errors = "",
  messages = "";
try {
  await wait(async () => {
    const r = await fetch("http://127.0.0.1:38471/health");
    return r.ok;
  }, "Bridge");
  const cred = JSON.parse(
    await readFile(path.join(directory, "bridge-credentials.json"), "utf8"),
  );
  const snapshot = async () => {
    const r = await fetch("http://127.0.0.1:38471/v1/snapshot", {
      headers: { Authorization: "Bearer " + cred.hookToken },
    });
    return r.json();
  };
  for (let i = 0; i < 2; i++) {
    const a = spawn(
      claude,
      [
        "-p",
        "--input-format",
        "stream-json",
        "--output-format",
        "stream-json",
        "--verbose",
        "--no-session-persistence",
        "--settings",
        settings,
        "--setting-sources",
        "project,local",
        "--debug-file",
        path.join(directory, "debug-" + i + ".log"),
        "--strict-mcp-config",
        "--mcp-config",
        '{"mcpServers":{}}',
      ],
      { cwd: project, env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    a.stderr.on("data", (b) => (errors += b));
    a.stdout.on("data", (b) => (messages += b));
    a.stdin.write(
      JSON.stringify({
        type: "control_request",
        request_id: "local-startup-check",
        request: { subtype: "initialize" },
      }) + "\n",
    );
    agents.push(a);
  }
  const active = await wait(async () => {
    const s = await snapshot();
    const a = s.sessions.filter(
      (s) => s.provider === "claude" && s.state === "idle",
    );
    return a.length === 2 ? a : false;
  }, "Two actual Claude SessionStart hooks");
  assert.equal(new Set(active.map((s) => s.id)).size, 2);
  assert(
    active.every((s) => s.confidence === "observed"),
    "CLI owner binding",
  );
  agents.forEach((a) => a.kill());
  await wait(async () => {
    const s = await snapshot();
    return s.sessions
      .filter((s) => s.provider === "claude")
      .every((s) => s.state === "offline");
  }, "Process cleanup");
  const report = {
    version: "2.1.304",
    runtime: "Installed native Claude Code, isolated settings/profile",
    actualSessionStartHooks: 2,
    uniqueSessions: true,
    nativeProcessBinding: true,
    terminationCleanup: true,
    userMessagesSent: 0,
    modelInference: false,
    providerEndpoint: "closed loopback port; no external model endpoint",
    limitations:
      "Tool/permission/completion transitions are contract fixtures; Node package owner matching not exercised",
  };
  await writeFile(
    "docs/claude-runtime-verification.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(errors.slice(-1800), messages.slice(-1800));
  throw error;
} finally {
  agents.forEach((a) => a.kill());
  server.kill();
}

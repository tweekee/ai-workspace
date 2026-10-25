// Optional installed-runtime test. No model inference: a second, QA-only
// SessionStart hook stops both invocations, and the provider points to loopback.
import { spawn } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const directory = path.resolve("test-results/codex-lifecycle"),
  project = path.join(directory, "project"),
  codexHome = path.join(directory, "codex-profile");
await mkdir(project, { recursive: true });
await mkdir(codexHome, { recursive: true });
const workspace = path.resolve(
  process.env.AI_WORKSPACE_TEST_EXE ??
    "src-tauri/target/debug/ai-workspace.exe",
);
const codex = process.env.AI_WORKSPACE_CODEX_EXE;
if (!codex)
  throw Error(
    "Set AI_WORKSPACE_CODEX_EXE to the installed Codex CLI executable.",
  );
const quote = (p) => p.replaceAll("\\", "/").replaceAll("'", "''");
const command =
  'powershell.exe -NoProfile -NonInteractive -Command "& ' +
  "'" +
  quote(workspace) +
  "'" +
  ' --report-hook codex"';
const gate = path.join(directory, "stop-before-inference.cjs");
await writeFile(
  gate,
  'setTimeout(()=>process.stdout.write(JSON.stringify({continue:false,stopReason:"Local lifecycle QA: inference disabled"})),10000);',
);
await writeFile(
  path.join(codexHome, "hooks.json"),
  JSON.stringify(
    {
      hooks: {
        SessionStart: [
          {
            hooks: [
              { type: "command", command, timeout: 3 },
              { type: "command", command: 'node "' + gate + '"', timeout: 15 },
            ],
          },
        ],
      },
    },
    null,
    2,
  ),
);
await writeFile(
  path.join(codexHome, "config.toml"),
  'model="lifecycle-test"\nmodel_provider="lifecycle-test"\n[features]\nplugins=false\n[model_providers.lifecycle-test]\nname="Local lifecycle QA"\nbase_url="http://127.0.0.1:9/v1"\nwire_api="responses"\nrequires_openai_auth=false\n',
);
const env = {
  ...process.env,
  AI_WORKSPACE_DATA_DIR: directory,
  CODEX_HOME: codexHome,
};
const server = spawn(workspace, ["--monitor-server"], {
  env,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
let serverError = "";
server.stderr.on("data", (b) => (serverError += b));
const wait = async (check, label, ms = 20000) => {
  let last;
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const value = await check();
      if (value) return value;
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw Error(label + " timed out " + (last?.message ?? ""));
};
let agents = [],
  stderr = "";
try {
  await wait(async () => {
    const r = await fetch("http://127.0.0.1:38471/health");
    return r.ok;
  }, "Monitor startup");
  const cred = JSON.parse(
    await readFile(path.join(directory, "bridge-credentials.json"), "utf8"),
  );
  const snapshot = async () => {
    const r = await fetch("http://127.0.0.1:38471/v1/snapshot", {
      headers: { Authorization: "Bearer " + cred.hookToken },
    });
    return r.json();
  };
  // Reviewed hooks only in this isolated QA profile; normal installation never bypasses trust.
  for (let i = 0; i < 2; i++) {
    const a = spawn(
      codex,
      [
        "--dangerously-bypass-hook-trust",
        "exec",
        "--skip-git-repo-check",
        "--ephemeral",
        "--json",
        "-C",
        project,
        "Lifecycle QA: startup hook stops before inference.",
      ],
      {
        cwd: project,
        env,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    a.stderr.on("data", (b) => (stderr += b));
    a.stdout.on("data", () => {});
    agents.push(a);
  }
  const active = await wait(async () => {
    const s = await snapshot();
    const a = s.sessions.filter(
      (s) => s.provider === "codex" && s.state === "idle",
    );
    return a.length === 2 ? a : false;
  }, "Two real Codex SessionStart hooks");
  assert.equal(new Set(active.map((s) => s.id)).size, 2);
  assert(
    active.every((a) => a.confidence === "observed"),
    "Actual CLI process ownership must bind",
  );
  await wait(
    () => agents.every((a) => a.exitCode !== null),
    "QA stop hooks",
    25000,
  );
  await wait(async () => {
    const s = await snapshot();
    return s.sessions
      .filter((s) => s.provider === "codex")
      .every((a) => a.state === "offline");
  }, "Real Codex process termination");
  const report = {
    version: "0.164.0",
    runtime: "Installed Codex CLI exec; isolated QA profile",
    actualSessionStartHooks: 2,
    uniqueSessions: true,
    processBinding: true,
    terminationCleanup: true,
    modelTurnsCompleted: 0,
    modelInference: false,
    providerEndpoint: "closed loopback port; no external model endpoint",
    trust:
      "One-off documented hook-trust flag for reviewed QA hooks only; user trust unchanged",
    limitations:
      "Generating/tool/approval transitions use hook-contract fixtures, not paid model turns",
  };
  await writeFile(
    "docs/codex-runtime-verification.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(stderr.slice(-3000));
  throw error;
} finally {
  agents.forEach((a) => a.kill());
  server.kill();
  if (serverError) console.error(serverError.slice(-1000));
}

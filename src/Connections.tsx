import { useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import {
  ArrowRight,
  Link2,
  Monitor,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import {
  installHooks,
  pairBrowser,
  revokeBrowsers,
  type LiveSnapshot,
} from "./core/live";
export function Connections({
  live,
  openLive,
}: {
  live: LiveSnapshot;
  openLive: () => void;
}) {
  const [pair, setPair] = useState<{ code: string; expiresAt: number } | null>(
      null,
    ),
    [message, setMessage] = useState(""),
    [project, setProject] = useState(""),
    [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState(["codex"]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="connection-intro">
        <ShieldCheck size={23} />
        <div>
          <h2>Your computer. Your conversations.</h2>
          <p>
            Visible tab indicators and advisory CLI hooks report state metadata
            to this app. No chat text is collected, no transcript is opened, and
            no model is called.
          </p>
        </div>
      </div>
      <div className="connection-row">
        <Monitor />
        <div>
          <h2>Chrome browser monitoring</h2>
          <p>ChatGPT · Claude · Gemini</p>
          <small>
            {live.bridge.listening
              ? live.bridge.pairedBrowsers +
                " paired browser profiles · loopback only"
              : live.bridge.error}
          </small>
        </div>
        <span className="limited-tag">
          {live.bridge.listening ? "Bridge ready" : "Desktop required"}
        </span>
      </div>
      <div className="connection-setup">
        <p>
          Load the supplied <code>browser-extension</code> folder with “Load
          unpacked” at <code>chrome://extensions</code>. Generate a code here
          and enter it in the extension popup. Reload existing AI tabs once
          after loading the extension.
        </p>
        <button
          className="button"
          disabled={!isTauri() || !live.bridge.listening || busy}
          onClick={() =>
            void run(async () => {
              setPair(await pairBrowser());
              setMessage("");
            })
          }
        >
          Generate pairing code
        </button>
        {pair && (
          <div className="pairing-code">
            <code>
              {Date.now() < pair.expiresAt ? pair.code : "Code expired"}
            </code>
            <small>Valid for 2 minutes · one use</small>
          </div>
        )}
        <button
          className="text-action"
          disabled={!isTauri() || busy || !live.bridge.pairedBrowsers}
          onClick={() =>
            void run(async () => {
              await revokeBrowsers();
              setPair(null);
              setMessage(
                "Browser pairings revoked. Paired extensions must reconnect.",
              );
            })
          }
        >
          Revoke browser pairings
        </button>
        <p className="field-help">
          Generation is inferred from visible stop controls. Idle requires a
          recognized composer. Approval controls mean waiting. Unrecognized
          pages remain uncertain.
        </p>
      </div>
      <div className="connection-row">
        <Terminal />
        <div>
          <h2>Local CLI hooks</h2>
          <p>Codex CLI · Claude Code · Gemini CLI</p>
          <small>
            Project-scoped lifecycle hooks with process exit detection.
          </small>
        </div>
        <span className="limited-tag">Opt-in per project</span>
      </div>
      <div className="connection-setup">
        <label className="field-label">
          Project folder
          <input
            aria-label="CLI project folder"
            value={project}
            onChange={(e) => setProject(e.target.value)}
            placeholder="C:\\Projects\\your-project"
          />
        </label>
        <div className="hook-providers">
          {["codex", "claude", "gemini"].map((p) => (
            <label key={p}>
              <input
                type="checkbox"
                checked={providers.includes(p)}
                onChange={(e) =>
                  setProviders((old) =>
                    e.target.checked ? [...old, p] : old.filter((x) => x !== p),
                  )
                }
              />
              {p === "codex"
                ? "Codex CLI"
                : p === "claude"
                  ? "Claude Code"
                  : "Gemini CLI"}
            </label>
          ))}
        </div>
        <button
          className="button"
          disabled={!isTauri() || busy || !project || !providers.length}
          onClick={() =>
            void run(async () => {
              const files = await installHooks(project, providers);
              setMessage(
                "Hooks installed in " +
                  files.length +
                  " project settings files. Restart the CLI in that project.",
              );
            })
          }
        >
          Install project hooks
        </button>
        <p className="field-help">
          Existing settings are merged and backed up. Hooks use this executable,
          never modify permission decisions, and fail open if the desktop app is
          closed. Start a new CLI session after installation. In Codex, trust
          the project and review the installed definitions with /hooks;
          untrusted hooks do not run.
        </p>
      </div>
      <div className="connection-row">
        <Link2 />
        <div>
          <h2>Cursor, Ollama & other integrations</h2>
          <p>Unsupported in this release.</p>
        </div>
        <span className="limited-tag">Unavailable</span>
      </div>
      {message && (
        <p className="connection-message" role="status">
          {message}
        </p>
      )}
      <div className="connection-bottom">
        <p>
          {live.sessions.length} real sessions detected. Each tab and CLI
          session has its own character.
        </p>
        <button className="button" onClick={openLive}>
          Open real office <ArrowRight size={14} />
        </button>
      </div>
    </>
  );
}

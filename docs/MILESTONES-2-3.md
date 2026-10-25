# Milestones 2–3 — local monitoring validation

Version 0.2.0, Windows x64, 25 October 2026. This is an implemented monitoring build with a real Chrome MV3 extension and native bridge, not an architecture-only milestone. The original pixel office remains intact. No model inference was used for character behavior or required by the monitoring tests.

## Implemented and exercised

- ChatGPT, Claude and Gemini top-frame content adapters read only visible control presence. Their MV3 worker validates actual tab origins, persists per-browser-run/tab identities across worker restarts and handles tab closure/navigation/discard, heartbeats and bridge errors.
- The native bridge binds only 127.0.0.1:38471. Native-generated expiring pairing codes issue separate 256-bit origin-bound credentials. The hook reporter uses another private credential. There is no website-accessible pairing-code endpoint. Strict metadata, body/time/rate/session bounds, Host validation, web-origin denial and monotonic replay protection are tested.
- Codex CLI, Claude Code and Gemini CLI project settings installation merges existing hooks and creates backups. Event contracts map startup, prompt, tool, permission, completion and shutdown to real session state. Gemini uses millisecond hook timeouts; Codex/Claude use seconds. Reporter stdin is filtered before forwarding metadata; prompts, tool arguments and transcript paths never enter snapshots.
- Hook ancestor recognition binds Codex/native CLI executables and Claude/Gemini Node package entrypoints. PID plus start time detects process death/reuse without treating a running process as evidence of generation. Unbound sessions explicitly show limited liveness and expire conservatively.
- Individual sessions feed the native sidebar, details, history, session table and existing animation engine. Four simultaneous browser tabs, including two ChatGPT tabs, remain separate. Seven combined browser/CLI records were displayed in the actual compiled Windows UI. Offline/unknown states stop work animation. Fresh installs use live mode; simulated office activity is isolated and labelled.

## Exact provider support

| Provider | Implemented behavior | What was actually verified | Remaining limitation |
| --- | --- | --- | --- |
| ChatGPT Chrome | Visible generating, composer idle, approval waiting, unknown and disconnect | Built extension loaded in Chromium; real popup pairing; DOM fixture transitions and close event through native registry/UI. A fresh live chatgpt.com page loaded and stayed Unknown. | Authenticated real generation/approval not verified; changing/localized UI selectors can need updates. Unknown is intentional when no indicator matches. |
| Claude Chrome | Same observable model with Claude selectors | Loaded-extension DOM fixture lifecycle; fresh live page stayed Unknown. | Authenticated real generation/approval not verified. |
| Gemini Chrome | Same observable model with Gemini selectors | Loaded-extension DOM fixture lifecycle; a fresh live gemini.google.com page reported Idle from its actual visible composer. | Authenticated real generation/approval not verified. |
| Codex CLI | Project hook installer, per-session metadata, tool/approval/completion states, process binding | Installed Codex 0.164.0 launched two actual isolated exec sessions. Both SessionStart hooks reached the native bridge, had distinct IDs and matched owner processes; termination made both offline. Exact reporter shell command was exercised. Tools/approval/completion also covered by contract fixtures/unit tests. | No paid model turn/tool run was started. Normal project/definition trust via /hooks is required. Managed policies can disable hooks. |
| Claude Code | Project hooks and native/Node ancestor recognition | Installed native Claude Code 2.1.304: two actual SessionStart events, unique IDs, native process binding and termination cleanup; no user message/model inference. Direct-executable hook form tested. Lifecycle tool/approval states and preservation of mixed hook groups also tested with contracts/config tests. | Node-based Claude installations and actual model/tool/permission turns remain unverified. Interactive workspace trust still applies. |
| Gemini CLI | Project hooks, permission notifications and Node/native ancestor recognition | Configuration including millisecond timeout, lifecycle classification and compiled reporter contract fixtures. | Gemini CLI is absent from this machine; installed-runtime behavior/owner matching are unverified. Treat this adapter as experimental. |
| Cursor, Ollama, other providers | None | Explicit unavailable UI | Unsupported. |

Monitoring installed hooks does not retroactively discover historical sessions. Start/restart the CLI after installation. A session with fresh later hook events can be detected; one with no hooks cannot. This release does not scrape logs or conversations. Browser identity is per tab, so separate conversations in a single tab are one observable tab session.

## Test results

- 20 frontend unit tests passed.
- 23 native Rust tests passed; rustfmt and clippy with -D warnings passed. The local filesystem emits a harmless incremental hard-link/copy warning, unrelated to source warnings.
- Five production-browser UI tests passed with a clean exit (18.3 seconds), including the preserved office controls, source honesty, CSP and responsive layouts.
- Loaded-extension + native bridge contract test passed, with four browser sessions and all three CLI reporters. Web-origin write was rejected, private fields were absent from snapshots, and closure/disconnect cleanup was observed. See monitoring-fixture-verification.json.
- Release Windows executable built successfully and launched under WebView2. The native test generated a pairing code through the actual desktop UI, paired the actual extension popup, installed all three project hook configurations through Connections (including verified Claude exec args and Gemini timeout), displayed four browser characters and seven combined session rows, inspected the CLI source badge and captured screenshots/real-monitoring-native.png. See native-monitoring-verification.json.
- Installed Codex runtime lifecycle test passed with two real SessionStart events, observed process binding and termination cleanup. The isolated QA profile used a documented one-off trust flag for reviewed hooks; normal product settings never bypass trust/approval. A second QA-only startup hook stopped before inference, and its provider endpoint was a closed local port. See codex-runtime-verification.json.
- Installed native Claude Code runtime startup/termination passed with two simultaneous sessions in an isolated profile. Only stream initialization controls were sent, no user messages or model inference. The initial shell-form probe exposed a Git Bash sandbox error; using Claude’s documented exec-form command+args fixed it and is now installed by the product. See claude-runtime-verification.json.
- Optional read-only live-site smoke sent no prompt: ChatGPT Unknown, Claude Unknown, Gemini Idle. These results do not establish authenticated generation support.

The Windows x64 executable is a portable build requiring WebView2. NSIS packaging is configured and validated by Windows CI; the local sandbox's NSIS tool fails with Windows error 623 (Illegal System DLL Relocation), so local installer execution cannot be claimed. See the pull request checks/artifacts for the installer packaging result. Builds are unsigned.

## Limitations

- DOM monitoring is best-effort observation of recognized visible controls. It cannot see internal reasoning or guarantee future provider UI compatibility. Unsupported UI stays Unknown.
- Chrome-compatible Chromium was used for automated extension tests. Ordinary installed Chrome with a user-authenticated provider profile has not been exercised. Load unpacked manually and reload existing tabs. Incognito is unsupported.
- All CLI activity depends on opted-in, enabled and trusted hooks; disabled hooks cannot be recovered from process presence alone. A missing owner is explicitly limited, becomes Unknown after 45 seconds and disconnects after two minutes. Bound CLI state reflects the most recent event until a new event or process exit.
- Session metadata/history are memory-only. Browser heartbeats rebuild current tabs after desktop restart; idle CLIs need a later hook/new session. There is no replay of old conversations.
- The bridge authenticates local clients; it does not protect against another process with the same Windows account's file access. It is loopback HTTP rather than TLS.
- No token/cost tracking, Cursor/Ollama adapters, startup integration, native notifications, automatic extension installation or non-Windows hook setup.

## Reproduce

Follow README.md for build requirements and commands. monitor:test uses the debug executable after cargo build. Set AI_WORKSPACE_TEST_EXE to a release executable for --desktop; set PLAYWRIGHT_BROWSERS_PATH only if using a custom browser cache. All test credentials and profiles are isolated under ignored test-results directories and are never committed.

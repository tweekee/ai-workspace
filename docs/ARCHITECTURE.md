# Architecture

Tauri 2/Rust owns local monitoring and native preferences. React/strict TypeScript validates snapshots. PixiJS 8 draws the existing original pixel office. Assets and fonts are bundled; no model API or cloud backend is used.

## Data flow

Chrome content scripts → MV3 worker → authenticated loopback HTTP → Rust registry → Tauri IPC → React + Pixi

Opted-in CLI hooks → native --report-hook mode → authenticated loopback HTTP → same registry

DemoDirector → separate synthetic registry → React + Pixi (only in explicitly selected demo mode)

## Browser observation

extension/src/adapters.ts recognizes visible provider controls conservatively. content.ts sends state changes and periodic metadata; background.ts validates the sender, derives the provider from the actual tab URL, owns credentials, and serializes updates. Browser-run UUID plus provider and tab ID distinguish simultaneous tabs. Session storage survives MV3 worker suspension. Alarms poll current tab state, and tab lifecycle events disconnect removed tabs. Unsupported UI stays unknown. No transcript/text is collected.

## Native bridge and sessions

src-tauri/src/monitor/mod.rs binds 127.0.0.1:38471, validates Host/Origin, pairs an extension through native-generated short-lived codes, and authenticates separate browser/hook credentials. Bodies are capped at 32 KiB; batches at 64, browsers at 8, request rate at 128/second and active registry entries at 128. JSON is strict. Browser timestamps older than 45 seconds or over 10 seconds in the future and repeated sequences are rejected. See tests for origin binding, replay, size limits, lockout, expiry and multi-session isolation.

model.rs stores per-source session records and 50-entry histories. Browser silence expires after 75 seconds. CLI ownership binds PID + process start time; termination or PID reuse disconnects a session. Unbound hooks are labelled limited-liveness, become unknown after 45 seconds and disconnect after 120. Completed transitions back to idle after three seconds. Offline records are retained for one minute. No historical session is synthesized from old logs.

process.rs inspects only a hook reporter's ancestor chain and then monitors its matched owner PID. It does not infer working state from a running process. hooks.rs classifies supported lifecycle events, filters the raw input, hashes session IDs, reports through short-deadline local TCP and always returns advisory {}. It installs project-local hooks by merging backed-up settings, without modifying global trust or permission decisions. Codex hook definitions require the user's normal /hooks review; installation does not bypass trust.

## UI and rendering

src/core/live.ts validates the native IPC snapshot. Real sources are labelled Browser · real and CLI · real; demo is explicitly simulated. The same states drive sidebar, history, details and office animation. Multiple sessions of one provider remain distinct, with ID suffixes on labels and staggered desk positions. Generating maps to working/response animation; tools map to reading, editing or terminal; approval maps to waiting. Unknown/offline do not keep a working animation. A native IPC failure makes stale sessions unknown.

The four-desk design, artwork, palette choices, customization and render caps are preserved. Static textures are cached; character frames update at 5 FPS, motion renders at 15/30/60 FPS. Hidden windows suspend drawing. Reduced motion avoids walking. Browser preview is UI-only and cannot fetch loopback monitoring endpoints.

## Tests and packaging

npm test covers the original state/layout foundation. Playwright covers UI/CSP/viewport regressions. Rust tests cover native persistence, hook configuration/classification, privacy filtering, registry lifecycle and bridge authorization. scripts/test-monitoring.mjs loads the actual built MV3 extension in Chromium, pairs it with the native Windows executable and exercises local provider DOM fixtures plus native hook reporters. --desktop additionally drives the compiled WebView2 UI and saves a screenshot. These fixtures do not prove authenticated provider-site behavior. scripts/verify-codex-lifecycle.mjs separately probes an installed Codex runtime without starting a model turn.

Windows CI runs frontend/native tests, loaded-extension bridge integration and NSIS packaging. Version tags create draft prereleases. No updater or startup agent is installed, and installers are unsigned. See MILESTONES-2-3.md for actual results and provider limitations.

## Primary references

- https://learn.chatgpt.com/docs/hooks
- https://learn.chatgpt.com/docs/app-server
- https://code.claude.com/docs/en/hooks
- https://geminicli.com/docs/hooks/reference/
- https://developer.chrome.com/docs/extensions/develop/concepts/network-requests
- https://playwright.dev/docs/chrome-extensions
- https://v2.tauri.app/start/prerequisites/
- https://pixijs.com/8.x/guides/components/application

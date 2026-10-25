# AI Workspace

An original, cozy pixel office for AI sessions. Local by default, independent of Wallpaper Engine, and free to run.

**Version 0.1.0 is the Milestone 1 foundation. Activity is simulated. Browser and CLI monitoring are not implemented yet.**

![AI Workspace — Maple studio](docs/screenshots/office.png)

## What works

- PixiJS office with original pixel art, four distinct animated workers, workstations, library, coffee counter, lounge, and meeting nook.
- Walking around furniture, typing, reading, terminal work, waiting, coffee breaks, and celebration animations driven by session state.
- Validated metadata registry, explicit state transitions, source isolation, heartbeat expiry, and bounded in-memory history.
- Functional team sidebar, session details, timeline, session filtering, workstation assignment, outfit selection, and draggable desks with collision checks.
- Maple and dusk palettes, 15/30/60 FPS targets, reduced motion, labels, optional completion chime, and pauseable demo.
- Preferences persist in browser storage for preview and the app configuration directory on desktop.
- Tauri 2 Windows shell, original application icon, NSIS installer configuration, automated frontend tests and Windows CI.

## Run the interactive preview

Install [Node.js 24 LTS](https://nodejs.org/) and run:

```powershell
npm ci
npm run dev
```

Open [the local preview](http://127.0.0.1:1420). This runs the actual application UI and renderer in a browser. It does not validate the native shell. Fonts and assets are bundled; no external services are contacted by the application.

## Run the Windows desktop app

Required: Windows 10/11, [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/), stable Rust (minimum 1.90), Microsoft C++ Build Tools with the **Desktop development with C++** workload and Windows SDK, and WebView2.

```powershell
npm ci
npm run desktop:dev
```

Build the NSIS installer:

```powershell
npm run desktop:build
```

The output is `src-tauri/target/release/bundle/nsis/*-setup.exe`. Unsigned builds may trigger Windows SmartScreen. No installer should be treated as production-ready without native testing. See [milestone validation](docs/MILESTONE-1.md) for the exact results.

## Explore the office

Select a teammate in the room or sidebar to inspect their session. **Advance demo state** advances one fictional task. **Pause demo** freezes state progression; character animation continues. **Customize** lets you drag desks within the studio rug; invalid placements are rejected. Desk assignment swaps occupants when necessary.

Settings save automatically. Live mode removes simulated sessions and shows an empty office until real connectors exist. Token usage remains **Unavailable** unless authoritative usage metadata is supplied; the demo supplies none.

## Validation

```powershell
npm test
npm run build
npx playwright install chromium
npm run test:e2e
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
```

Browser tests cover rendering and animation, zero remote requests, teammate inspection, state progression, assignment, appearance, persistence, furniture dragging, live-mode honesty, navigation, diagnostics, and 1024/768/390px layouts. Browser tests do not exercise Tauri IPC.

## Roadmap

| Milestone | Scope                                                                       | Status                                              |
| --------- | --------------------------------------------------------------------------- | --------------------------------------------------- |
| 1         | Desktop foundation, pixel office, demo, state machine, preferences          | Implemented; validation details in milestone report |
| 2         | Restricted-domain Chrome MV3 extension and authenticated local bridge       | Not implemented                                     |
| 3         | Active Codex CLI, Claude Code, Gemini CLI sessions; lifecycle detection     | Not implemented                                     |
| 4         | Further animation polish, native notifications, optional fictional dialogue | Partial visual foundation only                      |
| 5         | Native smoke tests, performance profiling, validated versioned installer    | Build workflow prepared; no release published       |

Cursor, Ollama, custom adapters, startup integration, and native notifications are unavailable in this version. There is no hidden fake fallback.

## Architecture & privacy

See [architecture](docs/ARCHITECTURE.md), [privacy](docs/PRIVACY.md), [contributing](CONTRIBUTING.md), and [dependency attribution](THIRD_PARTY_NOTICES.md).

Original code, artwork, and icon are MIT licensed. No proprietary office sprites, competitor code, provider logos, or third-party visual assets were copied. Provider names identify planned integrations, not endorsement.

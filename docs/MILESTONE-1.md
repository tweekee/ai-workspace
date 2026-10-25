# Milestone 1 — Desktop foundation

Date: 2026-10-25. Version: 0.1.0.

## Features implemented

- Tauri 2/Rust Windows shell and fixed-path native preference commands.
- TypeScript strict-mode React app and PixiJS WebGL office.
- Original office, furniture, icon, and four distinct animated pixel workers.
- State-driven walking, work, reading, terminal, waiting, coffee, and completion behavior.
- Agent registry with strict versioned metadata validation, stable session keys, lifecycle, unknown state, monotonic events, bounded history, and stale-event rejection.
- Explicit demo source, pause and manual advancement; live mode contains no simulated sessions.
- Functional sidebar, details, session filters, activity timeline, appearance, workstation swaps, palette, performance settings, reduced motion, desk dragging, collision checks, and diagnostics export.
- Bundled fonts and artwork, no model calls, cloud backend, telemetry, credentials, or unrelated file access.
- MIT license, setup/architecture/privacy documentation, dependency attribution, Windows CI, draft release workflow.

## Files

- `src/core/`: model, registry, demo, preferences, and layout validation.
- `src/scene/`: original artwork, grid navigation, PixiJS renderer, and React lifecycle.
- `src/App.tsx`, `src/styles.css`: interactive UI and responsive styling.
- `src-tauri/`: Rust host, native settings boundary, capability and installer configuration, original icons.
- `tests/`: core validation and browser interaction tests.
- `.github/workflows/`: Windows and frontend validation; gated draft prereleases.
- `docs/`: architecture, privacy, design decisions, screenshots, and attribution.

## Validation

- `npm test`: **20 core tests passed**.
- `npm run build`: **passed**, strict type checking and production Vite build.
- `npm run test:e2e`: **5 end-to-end tests passed** in Playwright Chromium on this Windows host.
- Browser coverage: rendering and changing animation frames; teammate inspection; explicit demo transitions; unavailable token usage; outfit changes; desk assignment; native-free preview persistence; live/demo separation; draggable desks and persisted layout; session filters; timeline; connector limits; diagnostics download; no remote runtime requests; 1024/768/390px overflow checks.
- `cargo test --manifest-path src-tauri/Cargo.toml`: **7 native tests passed**. Covers complete settings, field allowlist, version, size limit, frame rate, unique desks, and appearance validation.
- Native Rust compilation succeeded with a workspace-local Rust 1.99.1 toolchain. No global toolchain install was performed.
- Rust Clippy with warnings denied: **passed**.
- Optimized Windows executable: **compiled**. Native launch exposed a CSP conflict, fixed with Pixi static adapters. **Native WebView2 smoke test passed** after the fix: office canvas, four sessions, native preference read through IPC, teammate inspection, demo advancement, and Settings navigation. No native preferences were written during the smoke test.
- NSIS installer packaging on this sandbox host: **blocked**. Both official makensis launchers fail with Windows error 623 (Illegal System DLL Relocation). Copying the hash-verified tools into the workspace resolved a separate cache rename restriction but did not resolve native tool launch. The Windows CI build runs on a separate runner.
- Screenshots reviewed at desktop and mobile widths. Floor clipping corrected after visual inspection.

## Known limits

This milestone has **no real browser extension, loopback activity bridge, process detector, or CLI log adapter**. Browser AI, coding agents, Cursor, Ollama, startup behavior, and desktop notifications show their unavailable/planned state. No usage or cost estimates are fabricated.

Browser tests do not verify native behavior. A separate native smoke test verified rendering and read-only IPC; native preference writes, OS lifecycle, installer installation/uninstallation, and hardware performance are not yet smoke-tested. FPS values are configurable targets, not measured guarantees. Installer signing and production release validation remain Milestone 5 work.

No production release or version tag has been published.

## Next priority

Milestone 2: restricted-domain MV3 extension, an explicitly paired authenticated loopback bridge, schema-validated tab lifecycle events, and adapter tests with ChatGPT, Claude, and Gemini DOM fixtures. Real-site checks must identify which visible indicators can actually be observed. No claim of internal model activity.

Browser tests now exercise the production build under the same strict CSP as Tauri. An animation assertion that aliased periodic frames was replaced with a bounded changed-frame observation and passed three repeated runs.

An unsigned standalone x64 executable (about 9 MB, excluding the OS WebView2 runtime) was built from the corrected source and copied into the deliverables folder. The corrected runtime commit 2ce9f8fbe3f11ab3fa395f31de5e7270a3fc79da completed both Windows packaging and frontend CI successfully: https://github.com/tweekee/ai-workspace/actions/runs/40218760787. The Windows installer is available as the ai-workspace-windows-preview artifact on that run. This installer includes the CSP fix. Final documentation and smoke captures do not change the validated runtime.

## Native smoke evidence

The opt-in script is scripts/native-smoke.mjs. It attaches to the compiled application through WebView2 CDP, as documented by [Playwright](https://playwright.dev/docs/webview2), with test-only browser arguments and a workspace-local WebView2 data folder. Debugging is not enabled in the shipped executable by default. See screenshots/native-office.png and screenshots/native-office.json for the actual native capture and observed assertions. The test process is stopped after verification.

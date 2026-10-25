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
- Optimized Windows executable: **compiled**. Native launch exposed a CSP conflict, fixed with Pixi static adapters. Native smoke verification is being rerun.
- NSIS installer packaging on this sandbox host: **blocked**. Both official makensis launchers fail with Windows error 623 (Illegal System DLL Relocation). Copying the hash-verified tools into the workspace resolved a separate cache rename restriction but did not resolve native tool launch. The Windows CI build runs on a separate runner.
- Screenshots reviewed at desktop and mobile widths. Floor clipping corrected after visual inspection.

## Known limits

This milestone has **no real browser extension, loopback activity bridge, process detector, or CLI log adapter**. Browser AI, coding agents, Cursor, Ollama, startup behavior, and desktop notifications show their unavailable/planned state. No usage or cost estimates are fabricated.

Browser tests do not verify native WebView IPC, OS lifecycle, installer installation/uninstallation, or hardware performance. FPS values are configurable targets, not measured guarantees. Installer signing and production release validation remain Milestone 5 work.

No production release or version tag has been published.

## Next priority

Milestone 2: restricted-domain MV3 extension, an explicitly paired authenticated loopback bridge, schema-validated tab lifecycle events, and adapter tests with ChatGPT, Claude, and Gemini DOM fixtures. Real-site checks must identify which visible indicators can actually be observed. No claim of internal model activity.

Browser tests now exercise the production build under the same strict CSP as Tauri. An animation assertion that aliased periodic frames was replaced with a bounded changed-frame observation and passed three repeated runs.

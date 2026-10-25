# Architecture

## Stack decision

Tauri 2 + Rust provides the Windows shell without bundling a second browser runtime. TypeScript strict mode and React keep UI state separate from rendering. PixiJS 8 renders the original pixel art using WebGL and nearest-neighbor texture sampling. Vite builds the local frontend. No paid infrastructure is needed.

Official references reviewed before implementation:

- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
- [Tauri upstream source and licensing](https://github.com/tauri-apps/tauri)
- [PixiJS Application initialization](https://pixijs.com/8.x/guides/components/application)
- [PixiJS upstream source and MIT license](https://github.com/pixijs/pixijs)

No reference-product source code or sprites are included.

## Boundaries

```text
React views ── validated preferences ── Tauri IPC ── fixed app config file
    │
    ├── DemoDirector ── AgentRegistry ── session snapshots
    │                         ↑
    │                    metadata boundary
    │                  future adapter modules
    └── OfficeEngine ── PixiJS ── original Canvas-generated textures
```

- `src/core/model.ts`: bounded strict metadata schema, provider identifiers, state and task vocabulary, transition table.
- `src/core/registry.ts`: per-source stable IDs, monotonic sequences, freshness checks, source identity, liveness expiry, history retention.
- `src/core/demo.ts`: explicit synthetic event source. It cannot call a model or inspect a process.
- `src/core/settings.ts`: versioned preference schema and serialized writes; browser preview fallback.
- `src/core/layout.ts`: desk placement bounds and collision validation.
- `src/scene/art.ts`: all original raster pixel art generated once into cached textures.
- `src/scene/navigation.ts`: bounded four-direction grid path search around furniture.
- `src/scene/OfficeEngine.ts`: scene lifecycle, animation, interactions, z-order, resizing, visibility suspension.
- `src-tauri`: a small Rust command surface, fixed configuration path, size-capped metadata persistence; no filesystem or process plugin exposed.

## State machine

States: `offline → detected → idle → thinking → working → waiting → completed → idle`.

Transitions branch according to explicit evidence. `unknown` remains distinct. Offline is produced by disconnect events or heartbeat expiry. A heartbeat confirms only transport liveness and never implies a model is working. Stale metadata cannot create a session. Source plus session ID forms the registry key. A session must reconnect after expiry. History is capped at 50 changes; offline removal is explicit.

The registry is integration-ready infrastructure. Milestone 1 feeds it only synthetic demo events. There is no active browser bridge, process watcher, session-log reader, or adapter claiming real activity.

## Future connector contracts

Adapters should emit versioned metadata events, never full conversations. Browser tab IDs must include a browser-instance nonce; close events should disconnect them. A future local bridge must bind only loopback, authenticate a paired extension, validate origin and message sizes, and reject replay. It is not started in this build.

MV3 content scripts should be restricted to supported hosts. DOM indicators are evidence of visible UI only, not internal model thought. Hooks/log adapters must correlate fresh session activity with process liveness and never resurrect historical logs. Unknown and limited detection are first-class outcomes.

Token usage may be displayed only with official-log or official-API evidence. No estimates or cost calculations are implemented.

## Rendering and performance

Static art and animation frames are cached as textures. Character textures change at 5 FPS; movement renders at the selected 15/30/60 FPS cap. Motion stops while the window is hidden. Pixel art uses no filters, shaders, external imagery, or network fonts. Reduced motion places workers at their destination and caps rendering at 15 FPS. The scene is a small 512×368 logical canvas, scaled to the available area.

FPS is a target, not a measured guarantee. CPU, memory, battery, and hardware-level performance are not yet benchmarked. Scene positions and activity history are not persisted.

## Packaging

CI tests frontend behavior and compiles the Windows shell on Windows runners. The release workflow runs on version tags and creates a draft prerelease only after test/build success. It does not sign installers or publish production claims. No updater, elevated installer, background server, or startup entry is installed.

## Content security policy validation

The native policy does not allow eval. PixiJS static shader/uniform adapters are imported through pixi.js/unsafe-eval; despite the package name, these replace dynamic compilation with static routines. The production preview serves the same CSP, and all browser interaction tests run against that production build. This catches native policy regressions before packaging.

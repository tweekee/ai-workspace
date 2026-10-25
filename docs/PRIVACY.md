# Privacy

AI Workspace 0.2.0 runs locally. It has no accounts, telemetry, cloud backend, API keys, or LLM inference. Browser AI providers and CLI tools remain responsible for their own network behavior; this monitor does not initiate model requests.

## Browser metadata

The Chrome extension runs in top-level pages on https://chatgpt.com, https://claude.ai and https://gemini.google.com. It checks the visibility of specific composer, stop and approval controls. It never reads or transmits chat text, page titles, cookies, credentials, conversation IDs, or URL paths. A tab record contains an opaque browser-run/tab identifier, provider, observable state, coarse task category, timestamp, sequence and evidence code. Browser tabs are identified individually, not by conversation history.

A recognized stop control means generating; a composer means idle; explicit approval controls mean waiting. Unrecognized pages are unknown. Closed/discarded/navigated tabs disconnect. A missing heartbeat disconnects after 75 seconds. No hidden internal model state is inferred.

## CLI metadata

Only opted-in project hooks report activity. The native reporter receives each provider's standard hook JSON on stdin, capped at 1 MiB. That input can contain prompts and tool arguments: it is parsed transiently, filtered in memory and discarded. Only a SHA-256-derived session ID, provider, event name, state, coarse task category, project folder basename, timestamp, sequence and reporter PID are sent to the local bridge. No transcript is opened; historical logs are not scanned.

To bind liveness, the native bridge inspects only the reporter's ancestor process chain, up to eight processes. It reads process name, parent, PID and start time. For Node-based Claude/Gemini ancestors it transiently examines the first three command-line arguments to recognize their package entrypoint; these are never stored or transmitted. Subsequent checks refresh only bound PIDs/start times. The app does not enumerate unrelated command lines, environment variables, CPU or memory usage.

## Local communication and storage

The native bridge listens only on 127.0.0.1:38471. An eight-character, single-use pairing code expires in two minutes and locks after eight failures. Paired extensions receive separate 256-bit credentials bound to their extension origin and client identity. Web origins cannot write observations; native hooks require a separate private token. Requests are size/time/rate limited and observations are freshness checked with monotonic replay rejection. Host validation prevents alternate-host DNS rebinding. This is local authenticated HTTP, not encrypted transport; another process with your user account's access can read your local configuration. It is not a boundary against a compromised Windows account.

Desktop data lives in %APPDATA%/io.github.tweekee.aiworkspace:

- preferences.json: theme, motion, demo setting, layout and appearance preferences.
- bridge-credentials.json: local hook token and paired extension credentials. Do not share this file.

Chrome stores its pairing token in extension-local trusted-context storage, unavailable to the content script. Tab states live in Chrome session storage. Activity/history live only in desktop memory, capped at 128 sessions and 50 changes per session; offline records expire after a minute. Restarting the desktop does not load historical sessions. AI_WORKSPACE_DATA_DIR can override the app data folder for isolated tests/portable use.

## Controls

Connections can revoke all browser pairings. Project hook installation is explicit, merges provider settings, and creates .ai-workspace-backup files; remove the entries containing --report-hook to stop CLI reporting or restore a reviewed backup. No global CLI settings, tool approval decisions, provider authentication or startup entries are changed. Hooks return advisory empty JSON and fail open if the app is closed.

Live and simulated offices are separate modes, clearly labelled. Demo mode is disabled on a fresh installation. Browser preview cannot access the monitoring bridge and says the desktop app is required. Export diagnostics omits credentials, chat contents and activity history. Fonts/art are bundled, and the renderer connects only to Tauri IPC. Sound is optional. Native notifications are unavailable.

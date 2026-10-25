# Privacy

AI Workspace 0.1.0 has no accounts, telemetry, cloud backend, paid services, API keys, or model inference.

## What is stored

Preferences only: palette, frame rate, demo setting, labels, reduced motion, sound preference, desk positions, workstation assignments, and outfit choices.

- Desktop: the Tauri app configuration directory for `io.github.tweekee.aiworkspace`, in `preferences.json`.
- Browser preview: `ai-workspace.preferences.v1` in localStorage for the local preview origin.

Session metadata and activity history are kept in memory only. Closing the application clears them. No prompts, generated text, credentials, conversation contents, or unrelated files are read.

## Network behavior

The application renderer has no remote network calls. Fonts and images are local. Tauri CSP limits connections to its IPC transport. The development server is loopback-only. Development dependency installation and CI require network access; runtime animation does not.

No loopback extension bridge runs in this milestone. No AI tab, process, or log monitoring is active.

## Controls

Disable demo mode to clear fictional sessions. Reset furniture from Settings. Preferences can be removed by deleting the app's fixed preference file or clearing preview-site storage. Corrupted or unsupported preferences produce a visible warning and load defaults.

Export diagnostics is explicit and includes only app version, runtime, integration availability, session count, and preferences. Review the JSON before sharing. Activity history and conversation text are excluded.

## Sound and notifications

Completion sound is optional and muted by default. Native notifications and Windows startup integration are not implemented. Decorative fictional dialogue is not implemented, and no model is called for character behavior.

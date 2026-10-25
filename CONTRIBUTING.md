# Contributing

Use Node.js 24 and stable Rust with the Tauri Windows prerequisites. Run `npm ci`, `npm test`, `npm run build`, and `npm run test:e2e` before opening a pull request. Run Rust formatting, tests, and Clippy for native changes.

Keep integrations honest: unavailable means unavailable. New adapters require lifecycle tests, strict metadata validation, documented evidence and limitations, explicit uncertain states, and no collection of conversation text by default.

Keep original pixel art or provide compatible licenses and attribution. Do not commit credentials, local conversation logs, binaries from unknown sources, dependency folders, or build output. Use feature branches and explain concrete behavior and validation in pull requests.

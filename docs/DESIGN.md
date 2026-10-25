# Design decisions

The interface answers: **Which assistant is doing what, and who needs me?**

The first screen leads with an original pixel office. The team sidebar repeats each worker's explicit state and opens inspection in one click. The room is the signature element; no decorative charts, fake usage totals, provider logos, or proprietary assets are used.

Design inventory: Maple studio; warm timber floor; four workstations; mint, peach, blue, and gold workers; coffee breaks; reading and terminal work; waiting for input; local-only preferences; uncertain activity; demo provenance. Every count derives from the actual current demo session array.

The frontend skill dealt true-black-flat and data-terminal. True-black-flat was selected for its quiet surfaces and brightness-only navigation. The brief explicitly requested navy chrome, so its palette was retained instead of the skill's neutral black. Canvas artwork necessarily exceeds the chrome's color budget. Locally bundled Inter is used at 400/500/600, with tabular figures, small functional headings, a compact rail, and no gradients or glows.

All artwork is original procedural raster pixel art, using a 512×368 logical scene. Canvas2D draws cached textures for PixiJS WebGL. Scene furniture is movable within the rug, with placement bounds and collision rules. Worker navigation routes around desk footprints. Demo frames are state-driven and consume no model tokens.

Screenshots are captured from the working UI in an actual browser, reviewed at desktop and narrow widths, and committed in docs/screenshots. Browser interaction tests additionally assert that the document does not overflow horizontally at 1024, 768, and 390px. Windows' native shell minimum width is 960px.

Limits: the current scene uses one cutaway room and four fixed worker styles, no furniture catalog, no audio asset packs, no fictional conversations, and no live connector activity.

The skill’s standalone inspector was attempted with both Chrome and headless shell but failed at browser startup in this sandbox. Working Playwright browser tests and reviewed screenshots provide the actual visual verification; the standalone inspector is not reported as passing.

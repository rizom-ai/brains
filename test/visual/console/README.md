# Console visual regression

The committed baselines cover Dashboard, Chat, the CMS library, and the CMS editor at
1440×1000, 768×1024, and 390×844 in both console climates.

Build the two client assets, provide a Chromium executable, then run the comparison:

```bash
(cd interfaces/web-chat && bun run build:ui)
(cd plugins/cms && bun run build:ui)
export CONSOLE_CHROMIUM_PATH=/path/to/chromium
bun run visual:console
```

After reviewing an intentional visual change, regenerate all baselines with:

```bash
bun run visual:console --update
```

The harness also asserts viewport width, document-level overflow, responsive editor/chat
modes, and bottom composer/save-bar placement. A comparison fails when more than 0.2% of
pixels differ beyond the per-channel tolerance. Failed captures are written to
`artifacts/` for review and are not committed.

# Console visual regression

The committed baselines cover Dashboard, Chat (plain conversation and the card-states session), the Studio library and editor, Account, Administration, Inbox, Content sync, Site, and Publishing at 1440×1000, 768×1024, and 390×844 in both console climates.

The harness drives Chromium through `Bun.WebView`. Build the two client assets, provide a Chromium executable, then run the comparison:

```bash
(cd interfaces/web-chat && bun run build:ui)
(cd plugins/studio && bun run build:ui)
export CONSOLE_CHROMIUM_PATH=/path/to/chromium
bun run visual:console
```

Use CI's pinned Chrome **142.0.7444.59** for baseline comparisons. On Linux hosts with different Fontconfig subpixel settings (for example NixOS), text rasterization can differ despite identical layouts and web fonts. Match the reviewed Linux RGB rendering for this test process only:

```bash
export FONTCONFIG_FILE="$PWD/test/visual/console/fontconfig-rgb.conf"
bun run visual:console --surface-prefix=studio- --a11y
```

CI uses this same Fontconfig file. It keeps the host font discovery/configuration and overrides only `rgba`; it does not change application CSS, screenshot baselines, or comparison tolerances. Do not regenerate baselines to compensate for a local rasterization mismatch.

Additional matched-state checks use disposable source fixtures through the production workspace providers (not handwritten operator views):

```bash
bun run visual:console --study-state=empty
bun run visual:console --study-state=busy
bun run visual:console --study-state=outage
bun run visual:console --study-state=failure
bun run visual:console --study-state=dense
```

Empty checks cover all eight workspaces, including both empty Administration tabs and Account's profile-managed/final-passkey protections. Busy checks cover Chat streaming/Stop and Site duplicate-build protection; outage checks guard against a false Inbox all-clear. Failure and dense checks retain expanded diagnostics, long build errors, exact final references, unknown repository statuses, and 44px phone disclosure-close targets. These Site workspace fixtures do not generate sites or contact the running preview. `--surface=`, `--viewport=`, and `--climate=` narrow one case; state captures have distinct names and never replace default-state images. Missing/differing PNG baselines still fail comparison until separately reviewed and approved.

After reviewing and approving an intentional visual change, regenerate all baselines with:

```bash
bun run visual:console --update
```

The harness also asserts viewport width, document-level overflow, responsive editor/chat modes, modal-sheet bounds, and bottom composer/save-bar placement. A comparison fails when more than 0.2% of pixels differ beyond the per-channel tolerance. Failed captures are written to `artifacts/` for review and are not committed. Core CI builds both app bundles and runs this comparison with Chrome.

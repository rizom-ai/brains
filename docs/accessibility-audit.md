# Accessibility audit

This report records what the axe audit checked on the surfaces people use on a live brain, what it found and what was fixed. It is not a conformance claim: axe checks part of WCAG automatically, and the manual pass (screen-reader announcements, focus order, dialog isolation, the contrast cases axe cannot decide) is tracked in [studio-ux-improvements.md](./plans/studio-ux-improvements.md).

## Standard

axe-core 4.13 with the tags `wcag2a`, `wcag2aa`, `wcag21aa` and `wcag22aa` (WCAG 2.0–2.2, levels A and AA). Every page is audited at 1280×800 and 390×844. Studio is audited in both climates, instrument (dark) and paper (light). Critical and serious violations are fixed; moderate and minor ones are listed here with a decision each.

## Running it

```sh
bun run a11y:audit -- <url>… [--passkey <file>] [--setup <url>] [--climate instrument|paper] [--json <file>]
```

Studio pages need a signed-in owner. Against a local test app, pass the startup log's `/setup?token=…` link as `--setup` and a file path as `--passkey` on the first run; later runs sign in through `/login` with the saved passkey. The passkey file holds a private key, so keep it out of the repository and use it only with test apps.

CI runs the console visual regression with `--a11y`, which audits the Studio fixture surfaces on every push, and the axe helper's own fixture test.

## Surfaces

| Surface             | Where audited                                                                    |
| ------------------- | -------------------------------------------------------------------------------- |
| Studio chat         | `/chat` on the rizom-ai test app, brain 0.2.0-alpha.743, signed in               |
| Studio Library note | `/studio/entities/note/<id>` on the same app, signed in                          |
| Web-chat guest page | https://yeehaa.io/ask, production                                                |
| rizom.ai Ask room   | https://rizom.ai/ask, production; also `/ask` on the test app's production build |

Studio is audited on a test app because production Studio needs the owner's own passkey. The Studio overview (`/studio`) and the sign-in page (`/login`) were audited alongside.

## Baseline, 18 November 2026

Violations as rules (nodes). Moderate and minor: none on any surface.

| Surface             | Climate    | 1280×800      | 390×844       |
| ------------------- | ---------- | ------------- | ------------- |
| Studio chat         | instrument | none          | none          |
| Studio chat         | paper      | 1 serious (1) | none          |
| Studio Library note | instrument | none          | none          |
| Studio Library note | paper      | 1 serious (2) | none          |
| Studio overview     | instrument | none          | none          |
| Studio overview     | paper      | 1 serious (7) | 1 serious (6) |
| Web-chat guest page | site       | none          | none          |
| rizom.ai Ask room   | site       | 1 serious (1) | 1 serious (1) |
| Sign-in page        | site       | none          | none          |

### Findings

1. **`color-contrast`, paper climate: the rail's active section number.** The number on the active rail item ("01", "02") is `#a8821c` on `#f4f0e5`, 3.13:1 at 9px; 4.5:1 is required. Studio chat and every Studio page at desktop width.
2. **`color-contrast`, paper climate: the "required" field marker.** `#876a24` on `#e9e5db`, 4.05:1 at 10px, in the note editor's properties.
3. **`color-contrast`, paper climate: overview timeline tick labels.** `#645f67` on `#e3d9bf`, 4.42:1 at 11px.
4. **`color-contrast`, paper climate: the overview's "published" status value.** `#4ade80` on `#f1ede2`, 1.48:1 at 19px.
5. **`aria-hidden-focus`, rizom.ai Ask room.** The network drawing (`.net-layer`) is `aria-hidden="true"` but holds a focusable link per approved agent (`/agents/<domain>`), so keyboard users reach links that screen readers are told do not exist. The test app does not show it: its agents are discovered, not approved, so the drawing has no links.

Every page also reports `color-contrast` as incomplete for text over gradients or images, which axe cannot measure; those cases belong to the manual pass.

### Every site theme

Studio takes its colors from the brain's site theme, so the rizom-ai findings above are one theme's share of a wider pattern. `scripts/accessibility/studio-themes.test.ts` audits the Studio fixtures (chat, an open entry, the overview) in every shipped theme and both climates. Before the fixes it found serious `color-contrast` violations in four of ten cases:

| Theme     | Climate    | What failed                                                                                     |
| --------- | ---------- | ----------------------------------------------------------------------------------------------- |
| rizom     | paper      | Muted text across the rail, fields, tables and overview (3.5–3.9:1); accent text; success green |
| rizom-ai  | paper      | Findings 1–3; success green in source-editor strings                                            |
| thefourth | instrument | Accent text (3.36:1); the dark mode's pale success and warning inks on its always-light ground  |
| thefourth | paper      | Accent text (3.36:1)                                                                            |

Default and books passed in both climates. The team brain runs the rizom theme.

## Fixes

| Finding                                   | Fix                                                                                                                                                                 | PR    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Accent text below 4.5:1 (findings 1, 2)   | Accent-colored text uses `--console-accent-text`, the accent mixed 65% with the text color; it reads at 5:1 or more in every theme and climate.                     | #1001 |
| Faint muted text (finding 3, rizom paper) | rizom paper muted text at 0.72 and 0.65 opacity, rizom-ai paper light text at 0.6.                                                                                  | #1001 |
| Pale success green on paper (finding 4)   | rizom and rizom-ai paper take the base's success ink; thefourth uses the light status colors in both modes.                                                         | #1001 |
| `aria-hidden-focus` on rizom.ai/ask (5)   | Network marks leave the tab order; `/agents` lists the same brains. The marks also linked to `/agents/<domain>`, which 404s, and now link to the agent's page slug. | #1001 |

After the fixes the theme audit passes in all ten cases. CI runs it on every push, beside `visual:console --a11y`.

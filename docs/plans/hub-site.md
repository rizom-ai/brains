# Plan: The hub's site

Last updated: 2026-10-25

## Status

In progress. Slices 1 and 2 (#764, #765) are on main and the `hub` brain runs on its own cohort; slices 3 and 4 are in review. The site pin follows the first publish of `@rizom/site-hub`.

## Goal

The Rizom hub gets its own site on its own brain at `hub.rizom.ai`. The landing page is the approved story design, [`docs/design/hub-homepage/story.html`](../design/hub-homepage/story.html): a full-screen field of lights that the reader's scroll drives through seven chapters, explaining why an ecosystem needs a hub and how the hub fits into Rizom. Four chapters are interactive: the connector leaving, the hub's Brain switched on and off, the holders in the Rizom structure, and planting hubs in the network.

## Baseline

- **No hub brain yet.** The rover-pilot fleet has no `hub` user. `thefourth` is the nearest precedent: an organization brain with its own cohort (core, media, web, chat, site), `addOverride: [site-content]` and a `siteOverride` pin.
- **External site packages.** `@rizom/site-thefourth` is the newest external site: a `defineSite` definition on `@rizom/site` alone, TypeScript source published as is, sections in a `sectionGroup` with their copy in `site-content/<route>/<section>.md`, falling back to the definition's `content`. Browser behavior ships as `headScripts` strings. Packages named `@rizom/site-*` join the site release lane by name and version independently from `0.2.0-alpha.0`.
- **The theme exists.** `@rizom/theme-rizom-ai` (published, `0.2.0-alpha.235`) carries the rev-5 tokens the design uses: night and cream, brass, ruby and moss, Fraunces over IBM Plex Sans and Mono, light and dark under `data-theme`. The site engine sets `data-theme` on `<html>` and flips it from any element with `data-theme-toggle`.
- **New npm packages.** A new `@rizom/site-*` name needs a placeholder publish and npm trusted publishing set up by the user before Site Release can publish it.

## Decisions

1. **One package.** `@rizom/site-hub` in `sites/hub`, modeled on `@rizom/site-thefourth`. There is no hub theme: the brain pins `@rizom/theme-rizom-ai`, and the hub's own styles (the field, the chapter cards, the rail) ship in the site's `themeOverride`, written against the theme's tokens, never hex values. Brass is the hub; ruby is Rizom B.V.; moss is the Rizom Foundation.
2. **The brain.** Handle `hub`, `hub.rizom.ai`, `profileKind: organization`, `anchorKind: organization`, anchor name "Rizom Hub", its own cohort `hub` with the `site` bundle, content repo `rizom-ai/hub-content`, setup email to yeehaa@rizom.ai.
3. **Content.** The route is `home`; each chapter is a section of the `home` group with its own schema (`opening`, `pipeline`, `programs`, `memory`, `labs`, `fit`, `network`, `start`), so its words, button labels and readout phrases live in `site-content/home/<chapter>.md`. The design's copy is the fallback content and the seeded entities. Figures that the drawing counts (people who left, cohorts, weeks, hubs) are computed by the script, not content.
4. **The field.** One browser script, attached as a head script, draws the field on a fixed canvas and runs the scene of the chapter under the middle of the screen. Each chapter section carries `data-hub-scene="<name>"`, so scenes are keyed by name, not order. The script reads the colors from the theme's tokens and redraws when `data-theme` changes. Without the script, the chapters read as text over the night ground. Reduced motion stops the drift and holds the pulses still.
5. **Interaction state stays in the page.** The connector, the Brain toggle, the selected holder and the planted hubs live in the script's memory; nothing is stored.
6. **Only what is real.** The header holds the wordmark, links to the page's own chapters and the theme toggle; the site names no city. The doors in the last chapter point to the site-info call to action (`cta.buttonLink`); there are no forms. The footer carries the commons line and links to rizom.ai, its Work and Foundation rooms. The federation note stays on the network chapter.
7. **Phone in every slice.** Below 860px the drawing holds the top of the screen and each chapter's card docks to the bottom; a lab phase or a holder shows its text only while it is active. Each slice ships its chapters at phone width.
8. **Delivery.** Each slice is released through the site lane, pinned in `users/hub.yaml` and deployed.

## Slices

Each slice writes its tests first; passes `bun run typecheck`, `bun test` and `bun scripts/lint.mjs --force --filter @rizom/site-hub`; adds a `site--` changeset; and is verified on a running test app (preview rebuild) before release, then on `hub.rizom.ai` at desktop and phone widths in both modes.

### 1. Walking skeleton

`hub.rizom.ai` opens on the opening chapter: the field of lights breathing beside "A place that keeps what its ecosystem learns.", under a header with the wordmark and the theme toggle, and a footer with the commons line.

- Tests first: the site renders the `home` route with the opening section from fallback content and from a `site-content` entity; the section carries its scene name; the layout renders the canvas, the header and the footer, with the theme toggle; the field script boots on the opening scene; the package boundary tests.
- Build: the package; the release-lane lists (`.syncpackrc.json`, `packages/build-tools/test/release-groups.test.ts`, the root `test:packed:sites` script, the `site-ci.yml` path filters).
- Fleet: the `hub` user and cohort in rover-pilot, `siteOverride` to `@rizom/site-hub` and `@rizom/theme-rizom-ai`, `images:lock`, deploy; the site-info call to action and copyright seeded in `hub-content`.

### 2. Why: chapters 01 to 03

The pipeline draining into the center with its count; the cohorts around the connector, with "Let the connector leave"; the hub that remembers, with the Brain toggle, the sparkline and its readout. The rail of chapter numbers arrives with them.

### 3. Labs: chapter 04

One lab on the 26-week dial: the audit, the pilot with the people the hub brings in, the Brain in use, and the Brain going home with the organization; the phases highlighted as the weeks pass; the Rizom Lab's price line.

### 4. How it fits into Rizom: chapter 05

The hub, organizations and members above Rizom B.V. and the Foundation's roots; the holders lit one by one and on hover or tap; the 60/15/25 split flowing, with delivery moving from Rizom B.V. to the hub's certified members.

### 5. The network and the doors: chapters 06 and 07

Hubs lighting up and linking to their nearest neighbors with no center, planting a hub by tapping the field, the federation note; the three doors and the field at rest.

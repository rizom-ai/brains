# Plan: The Fourth's site

Last updated: 2026-10-25

## Status

Planned. Slice 1 is next.

## Goal

The Fourth (a brand consultancy in Taipei, run by Samantha Shao and Becca Chen) gets its own site on its organization brain at `thefourth.rizom.ai`. The homepage is the approved "Paper theatre" design, [`docs/design/thefourth-homepage/paper-theatre.html`](../design/thefourth-homepage/paper-theatre.html): a story in four acts on paper and ink, with an interactive jargon translator, the three "spells" See, Tell and Reach, stories with their numbers, a crossroads and an epilogue introducing the two guides.

## Baseline

- **The brain.** `thefourth` runs in the rover-pilot fleet with `profileKind: organization`, `anchorKind: organization`, its own cohort (core, media, web, chat, site) and `siteOverride.package: "@brains/site-organization"`. Its content repo is `rizom-ai/thefourth-content`.
- **External site packages.** `@rizom/site-books` with `@rizom/theme-books` is the newest external pair: a `defineSite` definition on `@rizom/site` alone, TypeScript source published as is, and a theme whose default export is a CSS string. Packages named `@rizom/site-*` and `@rizom/theme-*` join the site release lane by name and version independently from `0.2.0-alpha.0`.
- **Section content.** A schema-first section (`defineSection` inside `sectionGroup`) renders from a `site-content` entity with id `<routeId>:<sectionId>`, stored as `site-content/<routeId>/<sectionId>.md` in structured markdown generated from its schema, and falls back to the site definition's `content` when no entity exists. The `site` bundle carries `site-content` and `site-builder`.
- **Images.** Site packages ship text assets only. Raster images live in the brain as image entities; the site builder writes each referenced image to `/images/<id>.<format>`, collecting references written as `entity://image/<id>` in any entity's markdown.
- **Fleet images.** A site pin needs an exact `version` (and `themeVersion`), and the operator commits a per-image manifest and lockfile from `brains-ops images:lock`.

## Decisions

1. **Packages.** `@rizom/site-thefourth` in `sites/thefourth` and `@rizom/theme-thefourth` in `shared/theme-thefourth`, modeled on the books pair. The theme carries the paper palette (ink `#232323`, paper `#F4EFE6`, red `#EF5959`, mint `#61F2AD`, mustard `#D6C91D`), the paper texture and the fonts (Playfair Display, Inter Tight) as semantic tokens; components use the tokens, not hex values.
2. **Content.** The homepage route is `home`; every act is a section of the `home` group with its own schema, so its copy lives in `site-content/home/<section>.md` and Samantha and Becca edit it in their brain. The design's copy is the definition's fallback content and the seeded entities.
3. **Only what is real.** The live page leaves out what the design marks as placeholders or points nowhere: the primary navigation, links to pages that do not exist, the testimonial, the social links, the brand test's link and the EN/中文 switch. Each returns when The Fourth supplies it. The header keeps the logo and the contact action; every call to action without a destination becomes the contact email.
4. **Illustrations.** The keyhole, key, balloon, scissors, signposts and spell marks are inline SVG components in the site package, as in the design.
5. **Photos.** The guides' portraits, the TWTN athlete and the workshop photo are image entities in `thefourth-content`; a photo field holds `entity://image/<id>` and the component renders `/images/<id>.webp`.
6. **Interaction.** "Break the spell" (the jargon scattering, the translation, the next spell) and the cursor sparks run as one small browser script attached to the Act II section; reduced motion shows the translation without the scattering.
7. **Delivery.** Each slice is released through the site lane, pinned in `users/thefourth.yaml` and deployed; the fleet adds `site-content` explicitly, as rizom.ai does.

## Slices

Each slice writes its tests first; passes `bun run typecheck`, `bun test` and `bun scripts/lint.mjs --force --filter <package>` for every package it touches; adds `site--` changesets; and is verified on a running test app (preview rebuild) before release, then on `thefourth.rizom.ai` at desktop and phone widths.

### 1. Walking skeleton

`thefourth.rizom.ai` opens on the title scene: the torn-paper curtain, the keyhole and key, "The Fourth" and its subtitle, under a header with the logo and the contact action, and a footer with the logo, "The Fourth · Taipei" and the email.

- Tests first: the site renders the `home` route with the title section from fallback content and from a `site-content` entity; the header and footer render no navigation links; the theme exports its tokens and fonts; the package boundary tests.
- Build: both packages; the release-lane lists (`.syncpackrc.json`, `packages/build-tools/test/release-groups.test.ts`, the root `test:packed:sites` script, the `site-ci.yml` path filters).
- Fleet: `siteOverride` to the published pins, `addOverride: [site-content]`, `images:lock`.

### 2. Acts I and II

The hero's "Once upon a time" and the curse of jargon with "Break the spell", the translation and "Try another spell" over the three examples.

### 3. Act III

The guide's three spells, See, Tell and Reach, with their marks, and the five sectors.

### 4. Act IV

The stories: the New Taipei City Art Museum numbers, the Rizom card with its photo, the TWTN photo; no testimonial.

### 5. The crossroads and the epilogue

"Which way?" with its signpost, and the two guides with their portraits and the contact email.

### 6. Motion and phone

The scroll reveals and the sparks, reduced motion, and the layout at phone widths.

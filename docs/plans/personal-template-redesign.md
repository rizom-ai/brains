# Plan: Personal Site Template Redesign

## Status

Implemented in the personal site templates and wired into the rover `default` test app. The final implementation uses the existing semantic theme contract instead of app-local color tokens.

## Goal

Refresh the personal site template with an editorial visual system:

- brand-color hero sections with inverse text, halo, and grain layers;
- markdown-marked italic accent words in homepage taglines;
- editorial recent-post cards that keep cover images;
- dark CTA/contact bookends;
- page-level flex behavior so short pages still push the footer flush to the viewport bottom.

Reference implementation:

- Mockup: `~/Documents/mylittlephoney/mockup/index.html`
- Consuming theme reference: `~/Documents/mylittlephoney/src/theme.css`

## Implemented scope

### `sites/personal/src/templates/homepage.tsx`

- Added `renderTagline(tagline)` helper that parses `*foo*` markers in `profile.tagline` and renders marked text as an italic accent.
- Kept unmarked taglines backward-compatible.
- Updated the hero to use semantic theme colors: `hero-decor bg-brand text-theme-inverse`.
- Updated buttons to use existing theme utilities instead of new app-local color names.
- Replaced recent-post cards with editorial cards:
  - preserved `post.coverImageUrl` at the top;
  - kept a gradient fallback when no cover exists;
  - added small-caps meta, editorial title treatment, optional excerpt, and `Read the post →` affordance;
  - switched to `rounded-md` and a soft tinted shadow.
- Updated the final CTA to `cta-decor bg-theme-dark text-theme-inverse flex-grow` so it works as the sticky-footer filler section.

### `sites/personal/src/templates/about.tsx`

- Removed the outer wrapper so sections are direct children of `<main>`.
  - `PersonalLayout` already renders `<main className="flex-grow flex flex-col">`.
  - Direct section children are required for the final `flex-grow` section to consume remaining viewport height.
- Updated the about hero to match the homepage treatment.
- Kept the story section on `bg-theme-subtle`.
- Added `flex-grow` to the story section when there is no contact section.
- Updated the contact section to match the homepage CTA.
- Kept the `Say hi.` heading with `hi.` rendered as the italic accent.

### `shared/theme-base/src/theme-base.css`

Moved reusable, non-palette-specific support into theme base:

- exposes `font-sans` and `font-heading` through `@theme inline`;
- adds sticky-footer body hygiene;
- defines `.hero-decor`, `.cta-decor`, `.pulse-sparkle`, and `@keyframes hero-pulse` using existing semantic tokens like `--color-brand`, `--color-brand-dark`, and `--color-accent`.

No app-local palette is required. Existing themes such as `@brains/theme-default` and `@brains/theme-rizom` provide the actual colors through their semantic tokens.

### `brains/rover/test-apps/default/brain.yaml`

Linked the rover default test app to the personal site template:

```yaml
site:
  package: "@brains/site-personal"
```

The test app continues to use the rover model's default theme unless `brain.yaml` explicitly overrides it.

### `brains/rover/eval-content/anchor-profile/anchor-profile.md`

Added a marked tagline so a reset default test app exercises italic accent rendering:

```yaml
tagline: "*Systems notes* for the city-scale web"
```

## Out of scope

Do not change these files as part of this template redesign unless a later review identifies a concrete bug:

- `sites/personal/src/layouts/PersonalLayout.tsx`
  - The existing sticky-footer structure is already the desired layout contract.
- `sites/personal/src/schemas/`
- `sites/personal/src/routes.ts`
- `sites/personal/src/datasources/`
- `sites/personal/src/index.ts`
- `sites/personal/src/plugin.ts`
- `packages/brain-cli/`

## Theme decision

The initial draft used new template-specific color utilities (`cream`, `sparkle`, `berry`) and an app-local rover test theme. That split was wrong for the rover default test app.

Current direction:

- templates use stable semantic utilities (`bg-brand`, `text-theme-inverse`, `bg-theme-subtle`, `bg-theme-dark`, `text-accent`);
- reusable decoration mechanics live in `theme-base`;
- actual palette choices stay in existing themes (`theme-default`, `theme-rizom`, or an explicit consuming-site theme override when a site genuinely wants a custom brand palette).

This keeps `@brains/site-personal` compatible with both existing theme families and avoids creating a new theme just for the rover default test app.

## Consuming-site data update

To opt into homepage italic accents, wrap the relevant tagline words in markdown italic markers and quote the YAML value:

```yaml
# anchor-profile.md, or equivalent profile data
tagline: "*Systems notes* for the city-scale web"
```

Sites without markers keep rendering plain text, so this is backward-compatible.

## Verification

Targeted checks:

```bash
bun run --filter @brains/site-personal typecheck
bun run --filter @brains/site-personal lint
bun run --filter @brains/theme-base typecheck
bun run --filter @brains/theme-base lint
bun run --filter @brains/rover typecheck
bun run --filter @brains/rover lint
```

Visual smoke test:

1. Reset the rover default test app if you want seeded tagline changes:

   ```bash
   rm -rf brains/rover/test-apps/default/brain-data \
     brains/rover/test-apps/default/data \
     brains/rover/test-apps/default/dist \
     /tmp/rover-default-test-content.git
   ```

2. Start it:

   ```bash
   cd brains/rover
   bun start:default
   ```

3. Trigger a site rebuild on the running app, then inspect `dist/site-preview`.

Confirm:

- homepage uses the personal template;
- hero uses the active theme's brand surface and inverse text;
- marked tagline words render as italic accent text;
- recent-post cards show cover images at the top;
- CTA/contact sections use the active theme's dark surface;
- the final content section consumes extra height on tall screens and the footer sits flush at the bottom;
- about-page hero and contact section match the homepage system.

## Design rationale

- **Theme semantics over template-local palettes.** The personal template should express intent and structure; the active theme should decide the actual colors.
- **No viewport-unit section heights.** This is a reading/content site. Fixed viewport-height sections make the same content feel inconsistent across laptop and large-monitor contexts. Use `min-height: 100dvh` only at the document/body level for sticky-footer behavior.
- **One bold move per page.** The H1 and italic accent are the visual anchor. Avoid extra decoration competing with that move.

# Plan: Standalone Site Authoring Ergonomics

## Context

`apps/mylittlephoney` is the first standalone brain repo built against
published `@rizom/brain`. Getting it to boot revealed four pattern
issues with how a standalone consumer writes a custom site. None of
them block Phase 1 (the site works), but all four are cleanups the
next standalone brain shouldn't have to rediscover.

Current mylittlephoney shape:

```
~/Documents/mylittlephoney/
├── package.json                    # file:./site dep + @rizom/brain + preact
├── brain.yaml                       # site.package: "@brains/site-mylittlephoney"
├── site/                            # sub-package (workaround)
│   ├── package.json                 # name: "@brains/site-mylittlephoney", peerDeps
│   └── src/
│       ├── index.ts                 # composes SitePackage
│       └── theme.css
└── ...
```

Two `package.json` files and a fake `@brains/*` scope for what should
be one flat directory.

## Priority 1 — Implicit site convention

**Problem:** brain.yaml's `site.package` field requires an importable
`@scope/name`. For a standalone repo with ONE custom site, the cleanest
place for that code is a plain `src/site.ts` file at the root, not a
second `package.json` deep in a sub-package.

**Proposal:** convention-over-configuration. The brain CLI auto-loads
`<cwd>/src/site.ts` (or `<cwd>/src/site/index.ts`) if it exists, no
yaml field required.

**Resolution order** in `resolveSitePackage`:

1. brain.yaml has `site.package` → explicit override wins
2. `<cwd>/src/site.ts` exists → import + register under a synthetic
   key → resolver picks it up
3. Brain definition's default site

**Implementation shape:** new helper
`packages/brain-cli/src/lib/register-conventional-site.ts` with a
dependency-injected import function (mirror of
`register-override-packages.ts`). Wired into `setBootFn` in the
brain-cli entrypoint AFTER `registerOverridePackages` — so explicit
overrides still win. Convention discovery is a CLI concern, not a
resolver concern.

**Effort:** ~1 hour (helper + tests + wiring + docs).

**Unblocks:** Priority 2 (below) becomes moot — no more sub-package,
no more fake scope.

**Status:** [ ] todo

## Priority 2 — Drop the `@brains/` scope from standalone sites

**Problem:** mylittlephoney's sub-package is named
`@brains/site-mylittlephoney`. Outside the brains monorepo this is
misleading — the `@brains/*` scope implies "part of the brains
packages on npm" but it's a local-only name. The name was picked
because `isScopedPackageRef` in `shell/app/src/brain-resolver.ts`
requires `@scope/name` format.

**Resolution if Priority 1 ships:** moot. No more sub-package
means no more package name, so nothing to mislabel.

**Resolution if Priority 1 doesn't ship:** broaden
`isScopedPackageRef` to accept bare package names too:

```ts
const PACKAGE_REF_PATTERN = /^(@[\w-]+\/)?[\w-]+$/;
```

So `site-mylittlephoney` or `phoney-site` work as valid refs.
Consumers can then pick a non-scoped name and drop the fake
`@brains/` prefix.

**Effort:** ~15 min (regex change + test), or **0 effort** if
Priority 1 ships first.

**Status:** [ ] todo (deferred pending Priority 1 outcome)

## Priority 3 — `brain init` scaffolds `src/site.ts` skeleton

**Problem:** `brain init` today creates `brain.yaml` + `package.json` +
`tsconfig.json` + `README.md` but NOT a place for custom site code.
Users who want a custom site have to figure out the convention
themselves by reading docs or copying from mylittlephoney.

**Proposal:** `brain init` always scaffolds a `src/` directory with
two starter files:

- `src/site.ts` — minimal SitePackage exporting the brain's default
  (same PersonalLayout as rover) so the user has something to edit
- `src/theme.css` — minimal brand override file with a palette
  comment block and one `--color-brand` override as an example

Users who don't customize just never touch these files — the
conventional `src/site.ts` still works because it's functionally
identical to the brain definition default. Users who customize edit
these files in place.

**Trade-off:** every new brain gets two files they may never touch.
Alternative is `--with-site` flag but that adds decision fatigue
during `brain init`. Defaulting to "always scaffold src/" is simpler
and the files are small.

**Effort:** ~1 hour (scaffold function + two template strings + 2 tests).
Depends on Priority 1 for the auto-discovery path to be the default.

**Status:** [ ] todo

## Priority 4 — `createPersonalSite()` factory

**Problem:** the mylittlephoney site manually composes two paired
symbols from `@rizom/brain/site`:

```ts
layouts: { default: PersonalLayout },
plugin: (config?) => personalSitePlugin(config ?? {}),
```

`PersonalLayout` and `personalSitePlugin` have to match. If the user
swaps one but forgets the other, the site boots with mismatched
layout + plugin and fails in subtle ways (wrong templates, missing
handlers).

**Proposal:** add factory helpers that pair layout + plugin:

```ts
import { createPersonalSite } from "@rizom/brain/site";
import type { SitePackage } from "@rizom/brain/site";
import { composeTheme } from "@rizom/brain/themes";
import brandTheme from "./theme.css" with { type: "text" };

const site: SitePackage = createPersonalSite({
  theme: composeTheme(brandTheme),
  entityDisplay: {
    post: { label: "Post" },
    series: { label: "Series", navigation: { show: false } },
  },
});
```

The factory internally wires `PersonalLayout`, `personalSitePlugin`,
and `routes`. Users only pass the theme and entity display
configuration. Same for `createProfessionalSite()`.

**Effort:** ~45 min (two factories + types + tests + docs).

**Status:** [ ] todo

## Recommended ordering

1. **Priority 1 first** (implicit site convention). Biggest ergonomic
   win, unblocks Priority 2, simplifies Priority 3.
2. **Priority 3** (scaffold). Makes the convention discoverable to
   new users without them reading the docs.
3. **Priority 4** (factories). Quality-of-life; saves users from
   pairing two symbols correctly.
4. **Priority 2** skipped (moot after Priority 1) or 15-minute
   follow-up if we decide sub-packages have a legitimate use case.

Total estimated effort: **~2.5 hours** for Priorities 1 + 3 + 4,
plus ~10 min to retrofit mylittlephoney to the new shape.

## Validation

Each priority lands with:

- Failing tests written first (TDD, per CLAUDE.md)
- `@rizom/brain` alpha bump and publish
- mylittlephoney migrated to the new pattern
- Boot verified end-to-end (personal-site plugin active, pink palette
  in the compiled CSS)

Phase 1 of `docs/plans/harmonize-monorepo-apps.md` stays "in
progress" until all three priorities land AND mylittlephoney has
run with real content for long enough to catch edge cases not hit
during the initial extraction.

## Status

- [ ] Priority 1: Implicit site convention
- [ ] Priority 3: `brain init` scaffolds `src/site.ts`
- [ ] Priority 4: `createPersonalSite()` / `createProfessionalSite()`
      factories
- [ ] Priority 2: Skipped or 15-min follow-up
- [ ] mylittlephoney retrofit to the new shape

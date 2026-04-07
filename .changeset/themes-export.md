---
"@rizom/brain": patch
---

Add `@rizom/brain/themes` subpath export with `composeTheme`.

Standalone site repos need `composeTheme(myThemeCSS)` to prepend
the shared base utilities (palette tokens, `@theme inline`
declarations that expose `--color-brand` / `--color-bg` / etc. to
tailwind, layer ordering, gradient / status utilities) to their
own brand overrides. Without composing, tailwind can't resolve
utilities like `bg-brand`, `text-brand`, or
`focus-visible:ring-brand` that the layouts depend on, and the
site build crashes with:

    Cannot apply unknown utility class `focus-visible:ring-brand`

Consumers use it like:

    import { composeTheme } from "@rizom/brain/themes";
    import type { SitePackage } from "@rizom/brain/site";
    import themeCSS from "./theme.css" with { type: "text" };

    const site: SitePackage = {
      theme: composeTheme(themeCSS),
      // ...
    };

Part of Tier 2 of `docs/plans/library-exports.md`, shipping early
because `apps/mylittlephoney` hit the missing-utility crash during
Phase 1 of the standalone extraction. The rest of Tier 2
(`@rizom/brain/plugins`) is still deferred.

The new entry follows the same pattern as `@rizom/brain/site`:
runtime re-export in `src/entries/themes.ts`, hand-written type
contract in `src/types/themes.d.ts`, bundled by `scripts/build.ts`
into `dist/themes.js` (11KB — it's essentially a re-exported CSS
string plus a pass-through function), and declared in the
`exports` map of `packages/brain-cli/package.json`.

Includes a source-level regression test at
`packages/brain-cli/test/themes-export.test.ts` that asserts all
four wiring points stay intact (entry file, type contract,
package.json exports map, and `libraryEntries` in build.ts).

/**
 * ⚠️ TEMPORARY HAND-WRITTEN PUBLIC API SURFACE ⚠️
 *
 * Public API contract for `@rizom/brain/themes`. Hand-maintained
 * as a stopgap because the auto-bundlers choke on the size and
 * edge cases of the `@brains/*` type graph. See
 * `docs/plans/library-exports.md` for the replacement plan.
 *
 * **Sync rules:**
 * - When `composeTheme`'s signature changes in `@brains/theme-base`,
 *   update this file in the same commit.
 * - The runtime side (`../entries/themes.ts`) re-exports the real
 *   implementation from `@brains/theme-base`. The .js bundle
 *   produced by `scripts/build.ts` is what consumers execute.
 *   This .d.ts file is what their tsc sees.
 */

/**
 * Prepend the shared base theme utilities to a site-specific theme
 * CSS string and return the combined result.
 *
 * The base utilities layer contains:
 *
 * - Palette tokens (`--palette-*`) for neutral colors, status colors,
 *   and universal UI signals
 * - `@theme inline` declarations that expose the semantic color
 *   tokens (`--color-brand`, `--color-bg`, `--color-text`, etc.) to
 *   Tailwind v4's JIT so utilities like `bg-brand`, `text-brand`,
 *   `border-brand`, `focus-visible:ring-brand` auto-generate
 * - Layer ordering (`@layer theme-base, theme-override`) so theme
 *   overrides cascade correctly regardless of concat order
 * - Universal gradient, status, selection, and warning utilities
 * - Prose color slots for `@tailwindcss/typography`
 *
 * Consumers MUST call `composeTheme(myThemeCSS)` when constructing a
 * `SitePackage.theme` from their own CSS. Without it, Tailwind can't
 * resolve utilities like `bg-brand` and the site build crashes with:
 *
 *     Cannot apply unknown utility class `focus-visible:ring-brand`
 *
 * @example
 * ```ts
 * import { composeTheme } from "@rizom/brain/themes";
 * import type { SitePackage } from "@rizom/brain/site";
 * import themeCSS from "./theme.css" with { type: "text" };
 *
 * const site: SitePackage = {
 *   theme: composeTheme(themeCSS),
 *   // ...
 * };
 * ```
 */
export function composeTheme(themeCSS: string): string;

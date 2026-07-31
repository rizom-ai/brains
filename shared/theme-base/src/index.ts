// Types for CSS imports are defined in types.d.ts
/// <reference types="./types.d.ts" />

import themeBaseCSS from "./theme-base.css" with { type: "text" };

/**
 * Prepend the shared base to a resolved theme, producing the stylesheet a
 * site is built with.
 *
 * Called once, by the shell's brain resolver, on the concatenation of theme
 * + site override + instance override. Theme packages never call it: a
 * theme is just a CSS string, and the shell adds the base for it.
 *
 * The base is not `@rizom/theme-default`. A brand theme layering over
 * theme-default is picking up default brand *values*; this is the shared
 * utility layer and token defaults underneath every theme, including
 * theme-default itself.
 *
 * Base utilities live in `@layer theme-base` and shared token defaults in
 * Tailwind's `theme` layer; theme-specific styles use `@layer
 * theme-override`. See theme-base.css for why those three rank the way
 * they do.
 */
export function withThemeBase(themeCSS: string): string {
  return themeBaseCSS + "\n\n" + themeCSS;
}

export default themeBaseCSS;
export { themeBaseCSS };

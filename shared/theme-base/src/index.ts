// Types for CSS imports are defined in types.d.ts
/// <reference types="./types.d.ts" />

import themeBaseCSS from "./theme-base.css" with { type: "text" };

/**
 * Prepend the shared base to a fully resolved theme.
 *
 * Called once, by the shell's brain resolver, on the concatenation of brand
 * theme + site override + instance override. Theme packages must not call
 * it: a brand theme layers itself over `@rizom/theme-default` (brand
 * values), which is a different thing from this base (shared utilities and
 * token defaults), and calling it here would inject the base twice.
 *
 * Base utilities live in `@layer theme-base` and shared token defaults in
 * Tailwind's `theme` layer; theme-specific styles use `@layer
 * theme-override`. See theme-base.css for why those three rank the way
 * they do.
 */
export function composeTheme(themeCSS: string): string {
  return themeBaseCSS + "\n\n" + themeCSS;
}

export default themeBaseCSS;
export { themeBaseCSS };

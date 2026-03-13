// Types for CSS imports are defined in types.d.ts
/// <reference types="./types.d.ts" />

import themeBaseCSS from "./theme-base.css" with { type: "text" };

/**
 * Compose a complete theme by prepending shared base utilities.
 *
 * Base utilities live in @layer theme-base; theme-specific styles
 * should use @layer theme-override to guarantee correct cascade order.
 */
export function composeTheme(themeCSS: string): string {
  return themeBaseCSS + "\n\n" + themeCSS;
}

export default themeBaseCSS;
export { themeBaseCSS };

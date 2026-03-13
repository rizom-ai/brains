// Types for CSS imports are defined in types.d.ts
/// <reference types="./types.d.ts" />

import { composeTheme } from "@brains/theme-base";
import themeCSSOnly from "./theme.css" with { type: "text" };

// Combined theme: base utilities (@layer theme-base) + yeehaa styles (@layer theme-override)
const themeCSS = composeTheme(themeCSSOnly);

/**
 * Customize the Yeehaa theme with additional CSS
 */
export function customizeTheme(
  baseTheme: string,
  ...customizations: string[]
): string {
  return [baseTheme, ...customizations].filter(Boolean).join("\n\n");
}

export default themeCSS;
export { themeCSS };

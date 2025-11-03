// Types for CSS imports are defined in types.d.ts
/// <reference types="./types.d.ts" />
// Export theme CSS as a string for Bun imports
import themeCSS from "./theme.css" with { type: "text" };

/**
 * Customize the default theme with additional CSS
 *
 * @param baseTheme - The base theme CSS (usually the default theme)
 * @param customizations - Additional CSS to customize the theme
 * @returns Combined theme CSS
 *
 * @example
 * ```typescript
 * import defaultTheme, { customizeTheme } from "@brains/theme-default";
 * import overrides from "./my-overrides.css" with { type: "text" };
 *
 * const theme = customizeTheme(defaultTheme, overrides);
 * ```
 */
export function customizeTheme(
  baseTheme: string,
  ...customizations: string[]
): string {
  return [baseTheme, ...customizations].filter(Boolean).join("\n\n");
}

export default themeCSS;
export { themeCSS };

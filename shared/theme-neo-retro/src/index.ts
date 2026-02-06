// Types for CSS imports are defined in types.d.ts
/// <reference types="./types.d.ts" />
// Export theme CSS as a string for Bun imports
import themeCSS from "./theme.css" with { type: "text" };

/**
 * Customize the Neo-Retro theme with additional CSS
 */
export function customizeTheme(
  baseTheme: string,
  ...customizations: string[]
): string {
  return [baseTheme, ...customizations].filter(Boolean).join("\n\n");
}

export default themeCSS;
export { themeCSS };

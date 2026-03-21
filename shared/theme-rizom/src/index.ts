// Types for CSS imports are defined in types.d.ts
/// <reference types="./types.d.ts" />

import defaultTheme from "@brains/theme-default";
import rizomExtensions from "./theme.css" with { type: "text" };

/**
 * Rizom brand theme — extends the default theme with gradients,
 * dot patterns, and animations.
 */
const themeCSS = [defaultTheme, rizomExtensions].join("\n\n");

export default themeCSS;
export { themeCSS };

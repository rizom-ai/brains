// Types for CSS imports are defined in types.d.ts
/// <reference types="./types.d.ts" />

import defaultTheme from "@brains/theme-default";
import rangerExtensions from "./theme.css" with { type: "text" };

/**
 * Ranger theme — extends the default theme with gradients,
 * dot patterns, and animations. Used by `sites/ranger`.
 *
 * Previously named `@brains/theme-rizom`. Renamed to free that name
 * for the new Rizom brand theme built in rizom-sites Phase 1.
 */
const themeCSS = [defaultTheme, rangerExtensions].join("\n\n");

export default themeCSS;
export { themeCSS };

// Types for CSS imports are defined in types.d.ts
/// <reference types="./types.d.ts" />

import themeCSSOnly from "./theme.css" with { type: "text" };

/**
 * Rizom brand theme — amber + purple bioluminescent palette.
 *
 * Shared by the Rizom site family. Theme profiles switch accent shade,
 * secondary purple, and typography via `[data-theme-profile]` attribute
 * selectors that the site runtime sets on <html> during head init.
 *
 * Dark mode is the designed experience (the marketing sites are built
 * to be read dark-first). Light mode is a supported fallback.
 */
export default themeCSSOnly;
export { themeCSSOnly };

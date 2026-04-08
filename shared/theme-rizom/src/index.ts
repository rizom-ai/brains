// Types for CSS imports are defined in types.d.ts
/// <reference types="./types.d.ts" />

import themeCSSOnly from "./theme.css" with { type: "text" };

/**
 * Rizom brand theme — amber + purple bioluminescent palette.
 *
 * Shared by rizom.ai (variant: ai), rizom.foundation (variant: foundation),
 * and rizom.work (variant: work). Variants switch accent shade and
 * secondary purple via `[data-rizom-variant]` attribute selectors that
 * the site plugin sets on <body> at boot.
 *
 * Dark mode is the designed experience (the marketing sites are built
 * to be read dark-first). Light mode is a supported fallback.
 */
export default themeCSSOnly;
export { themeCSSOnly };

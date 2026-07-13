// Types for CSS imports are defined in types.d.ts
/// <reference types="./types.d.ts" />

import defaultThemeCSS from "@brains/theme-default";
import themeCSSOnly from "./theme.css" with { type: "text" };

/**
 * Consolidated rizom.ai theme — the rev-5 design system from the site
 * consolidation mockups (docs/rizom-site-mockups.html): deep indigo
 * ground, brass accent with ruby/moss room variants, warm off-white
 * light mode as a first-class peer, Fraunces display over IBM Plex
 * Sans/Mono.
 *
 * Rooms switch accents via `[data-room="work"]` / `[data-room="foundation"]`
 * attributes that the site layout sets per route — replacing the
 * per-site `data-theme-profile` machinery in @brains/theme-rizom.
 */
const themeCSS: string = `${defaultThemeCSS}\n\n${themeCSSOnly}`;

export default themeCSS;
export { themeCSS, themeCSSOnly };

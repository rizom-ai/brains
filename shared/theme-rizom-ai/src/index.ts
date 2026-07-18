// Types for CSS imports are defined in types.d.ts
/// <reference types="./types.d.ts" />

import defaultThemeCSS from "@rizom/theme-default";
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
/**
 * The base theme's Google-font imports (Barlow, JetBrains Mono, a partial
 * Fraunces slice) are its own register — dead requests here. Stripped at
 * composition; theme.css imports the full rev-5 set itself. scripts/build.ts
 * serializes this same regex into the dist module.
 */
export const FONT_IMPORT_RE: RegExp =
  /^@import url\("https:\/\/fonts\.googleapis\.com[^"]*"\);\r?\n?/gm;

const themeCSS: string = `${defaultThemeCSS.replace(FONT_IMPORT_RE, "")}\n\n${themeCSSOnly}`;

export default themeCSS;
export { themeCSS, themeCSSOnly };

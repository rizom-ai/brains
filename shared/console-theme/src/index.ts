// Types for CSS imports are defined in types.d.ts
/// <reference types="./types.d.ts" />

import consoleThemeCSS from "./console.css" with { type: "text" };

/**
 * The Brain Console token sheet: --console-* variables under
 * [data-climate="instrument"|"paper"] scopes plus the shared command
 * palette. Consumed by the public Dashboard, guest Ask, and Studio shell;
 * each surface owns chrome appropriate to its authentication state.
 */
export const CONSOLE_THEME_CSS: string = consoleThemeCSS;

export { CONSOLE_CLIMATE_SCRIPT } from "./climate-script";
export { CONSOLE_FONTS_URL } from "./fonts";
export { CONSOLE_PALETTE_SCRIPT } from "./palette-script";
export { resolveConsoleThemeCSS } from "./theme-css";
export default consoleThemeCSS;

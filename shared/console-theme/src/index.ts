// Types for CSS imports are defined in types.d.ts
/// <reference types="./types.d.ts" />

import consoleThemeCSS from "./console.css" with { type: "text" };

/**
 * The operator-console token sheet: --console-* variables under
 * [data-climate="instrument"|"paper"] scopes, plus the shared chrome
 * (console strip) styled from them. Consumed as a string by SSR surfaces
 * (dashboard) and text-importing bundlers (web-chat, CMS editor).
 */
export const CONSOLE_THEME_CSS: string = consoleThemeCSS;

export { CONSOLE_CLIMATE_SCRIPT } from "./climate-script";
export { deriveConsoleSurfaces } from "./surfaces";
export type { ConsoleRouteLike, ConsoleSurface } from "./surfaces";

export default consoleThemeCSS;

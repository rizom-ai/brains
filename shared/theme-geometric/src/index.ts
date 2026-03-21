// Types for CSS imports are defined in types.d.ts
/// <reference types="./types.d.ts" />

import { composeTheme } from "@brains/theme-base";
import themeCSSOnly from "./theme.css" with { type: "text" };

const themeCSS = composeTheme(themeCSSOnly);

export default themeCSS;
export { themeCSS };

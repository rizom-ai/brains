// Types for CSS imports are defined in types.d.ts
/// <reference types="./types.d.ts" />

import { composeTheme } from "@brains/theme-base";
import themeCSSOnly from "./theme.css" with { type: "text" };

// Combined theme: base utilities (@layer theme-base) + default styles (@layer theme-override)
const themeCSS = composeTheme(themeCSSOnly);

export default themeCSS;
export { themeCSS };

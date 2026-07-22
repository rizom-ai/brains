/// <reference types="./types.d.ts" />

import defaultThemeCSS from "@rizom/theme-default";
import themeCSSOnly from "./theme.css" with { type: "text" };

/** Remove the base font requests; this theme owns its complete type register. */
export const FONT_IMPORT_RE: RegExp =
  /^@import url\("https:\/\/fonts\.googleapis\.com[^"]*"\);\r?\n?/gm;

const themeCSS: string = `${defaultThemeCSS.replace(FONT_IMPORT_RE, "")}\n\n${themeCSSOnly}`;

export default themeCSS;
export { themeCSS, themeCSSOnly };

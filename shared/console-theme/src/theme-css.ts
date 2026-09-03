import { withThemeBase } from "@brains/theme-base";
import appThemeDefaultCSS from "./app-theme-default.css" with { type: "text" };

const CSS_IMPORT =
  /^[ \t]*@import\s+(?:url\([^)]*\)|"[^"]+"|'[^']+')[^;\n]*;[ \t]*$/gm;

/**
 * Resolve the stylesheet used by authenticated app shells.
 *
 * The runtime's configured theme is already composed with theme-base. Brains
 * without a site theme receive the app-owned neutral default here so console
 * tokens still resolve without coupling core releases to a public site theme.
 * Imports are hoisted because a resolved theme starts with the
 * shared base, while CSS requires every @import to precede ordinary rules.
 */
export function resolveConsoleThemeCSS(
  themeCSS?: string,
  options: { imports?: "hoist" | "remove" } = {},
): string {
  const resolved = themeCSS?.trim()
    ? themeCSS
    : withThemeBase(appThemeDefaultCSS);
  const imports: string[] = [];
  const body = resolved.replace(CSS_IMPORT, (rule) => {
    imports.push(rule);
    return "";
  });

  if (options.imports === "remove") return body.trimStart();
  return imports.length > 0
    ? `${imports.join("\n")}\n\n${body.trimStart()}`
    : body;
}

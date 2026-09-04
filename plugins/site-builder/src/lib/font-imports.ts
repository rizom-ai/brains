/** CSS split into the font `@import` rules it declares and the rest. */
export interface FontImports {
  imports: string[];
  cssWithoutImports: string;
}

/**
 * Pull Google Font `@import` rules out of a stylesheet.
 *
 * Tailwind rejects `@import` rules that do not come first, and the theme CSS
 * is concatenated after the base CSS, so the font imports are lifted out here
 * and re-emitted ahead of the processed stylesheet. Imports of anything else —
 * `@import "tailwindcss"` above all — are left where they are.
 */
export function extractFontImports(css: string): FontImports {
  const fontImportRegex =
    /@import\s+url\([^)]+(?:fonts\.googleapis|fonts\.gstatic)[^)]*\)[^;]*;/g;
  const imports: string[] = [];

  const cssWithoutImports = css.replace(fontImportRegex, (match) => {
    imports.push(match);
    return "";
  });

  return { imports, cssWithoutImports };
}

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface ThemePackageBase {
  /** Specifier the emitted module imports the base theme from. */
  packageName: string;
  /**
   * Removed from the base CSS before concatenation — used when a theme owns
   * its own font register and the base's `@import`s would be dead requests.
   */
  stripPattern?: RegExp | undefined;
}

export interface BuildThemePackageOptions {
  /** Package root containing `src/` and the `dist/` to emit. */
  packageDir: string;
  /** This package's own theme CSS, inlined into the emitted module. */
  themeCSSOnly: string;
  /** Compose on top of another theme package instead of standing alone. */
  base?: ThemePackageBase | undefined;
}

export interface BuildThemePackageResult {
  distDir: string;
  cssLength: number;
}

/**
 * Emit a theme package's published artifact.
 *
 * A theme is one CSS string, so the "build" inlines `theme.css` into a
 * dependency-free ESM module plus its declaration — the bun text import
 * cannot ship. Themes layered on another theme import that base by package
 * name instead of inlining it, so base fixes reach consumers through npm
 * resolution rather than being frozen at this package's publish time.
 */
export function buildThemePackage(
  options: BuildThemePackageOptions,
): BuildThemePackageResult {
  const distDir = join(options.packageDir, "dist");

  rmSync(distDir, { recursive: true, force: true });
  mkdirSync(distDir, { recursive: true });

  writeFileSync(join(distDir, "index.js"), renderModule(options));
  writeFileSync(join(distDir, "index.d.ts"), renderDeclaration(options));

  return { distDir, cssLength: options.themeCSSOnly.length };
}

function renderModule(options: BuildThemePackageOptions): string {
  const css = JSON.stringify(options.themeCSSOnly);
  const { base } = options;

  if (!base) {
    return line([
      `const themeCSSOnly = ${css};`,
      `export default themeCSSOnly;`,
      `export { themeCSSOnly };`,
    ]);
  }

  // Concatenation uses string ops rather than a template literal so CSS
  // containing backticks or `${` cannot break out of the emitted source.
  const baseExpression = base.stripPattern
    ? `baseThemeCSS.replace(${base.stripPattern.toString()}, "")`
    : "baseThemeCSS";

  return line([
    `import baseThemeCSS from ${JSON.stringify(base.packageName)};`,
    `const themeCSSOnly = ${css};`,
    `const themeCSS = ${baseExpression} + "\\n\\n" + themeCSSOnly;`,
    `export default themeCSS;`,
    `export { themeCSS, themeCSSOnly };`,
  ]);
}

function renderDeclaration(options: BuildThemePackageOptions): string {
  if (!options.base) {
    return line([
      `declare const themeCSSOnly: string;`,
      `export default themeCSSOnly;`,
      `export { themeCSSOnly };`,
    ]);
  }

  return line([
    `declare const themeCSS: string;`,
    `declare const themeCSSOnly: string;`,
    `export default themeCSS;`,
    `export { themeCSS, themeCSSOnly };`,
  ]);
}

function line(lines: string[]): string {
  return [...lines, ""].join("\n");
}

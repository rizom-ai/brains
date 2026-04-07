/**
 * Library export for theme authoring. Re-exports the curated
 * runtime surface a standalone site repo needs to build a complete
 * theme CSS string from its brand overrides.
 *
 * The public type contract lives in `../types/themes.d.ts` and is
 * shipped verbatim as `dist/themes.d.ts` — see that file for the
 * sync rules.
 */

export { composeTheme } from "@brains/theme-base";

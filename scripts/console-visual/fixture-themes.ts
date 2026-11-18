import booksTheme from "@rizom/theme-books";
import defaultTheme from "@rizom/theme-default";
import rizomAiTheme, { FONT_IMPORT_RE } from "@rizom/theme-rizom-ai";
import thefourthTheme from "@rizom/theme-thefourth";
import rizomTheme from "@brains/theme-rizom";
import { withThemeBase } from "@brains/theme-base";

/**
 * Every site theme a brain can load, as Studio receives it: the brain's theme
 * composed over theme-base. A fixture page opened with `?theme=<name>` renders
 * Studio in that theme instead of the console's own default. The fixture
 * serves no remote fonts, so the themes' Google-font imports are dropped.
 */
const fixtureTheme = (themeCSS: string): string =>
  withThemeBase(themeCSS).replace(FONT_IMPORT_RE, "");

export const FIXTURE_THEMES: Readonly<Record<string, string>> = {
  books: fixtureTheme(booksTheme),
  default: fixtureTheme(defaultTheme),
  rizom: fixtureTheme(rizomTheme),
  "rizom-ai": fixtureTheme(rizomAiTheme),
  thefourth: fixtureTheme(thefourthTheme),
};

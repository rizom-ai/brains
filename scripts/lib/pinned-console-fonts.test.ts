import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  CONSOLE_FONTS_URL,
  resolveConsoleThemeCSS,
} from "@brains/console-theme";
import {
  PINNED_CONSOLE_FONTS_DIR,
  consoleFontStylesheets,
  pinConsoleFonts,
  pinnedConsoleFontStylesheets,
  servePinnedConsoleFont,
} from "./pinned-console-fonts";

// The console visual baselines are drawn with one exact set of font files.
// Fetching them from Google at test time let a different build of a face
// shift glyphs by a subpixel on some runs.
describe("pinned console fonts", () => {
  it("covers every font stylesheet a console page loads", async () => {
    const pinned = await pinnedConsoleFontStylesheets();
    expect(consoleFontStylesheets()).toContain(CONSOLE_FONTS_URL);
    expect(consoleFontStylesheets()).toEqual(
      expect.arrayContaining(
        [...resolveConsoleThemeCSS().matchAll(/@import url\("([^"]+)"\)/g)]
          .map((match) => match[1])
          .filter((url) => url?.startsWith("https://fonts.googleapis.com/")),
      ),
    );
    // Re-vendor when a console page's fonts change.
    expect(Object.keys(pinned).sort()).toEqual(consoleFontStylesheets().sort());
  });

  it("points a page at the pinned stylesheets, however its links are escaped", async () => {
    const pinned = await pinnedConsoleFontStylesheets();
    const local = pinned[CONSOLE_FONTS_URL];
    const escaped = CONSOLE_FONTS_URL.replaceAll("&", "&amp;");
    const imports = resolveConsoleThemeCSS();
    const html = `<link href="${CONSOLE_FONTS_URL}" rel="stylesheet" /><link href="${escaped}" rel="stylesheet" /><style>${imports}</style>`;
    const page = await pinConsoleFonts(html);
    expect(page).toContain(
      `<link href="${local}" rel="stylesheet" />`.repeat(2),
    );
    expect(page).not.toContain("fonts.googleapis.com/css");
  });

  it("refuses a page that would still fetch fonts from the network", async () => {
    expect(
      pinConsoleFonts(
        '<link href="https://fonts.googleapis.com/css2?family=Other" rel="stylesheet" />',
      ),
    ).rejects.toThrow("fonts.googleapis.com");
    expect(
      pinConsoleFonts(
        "@font-face { src: url(https://fonts.gstatic.com/s/fraunces/v38/a.woff2); }",
      ),
    ).rejects.toThrow("fonts.gstatic.com");
  });

  it("leaves a preconnect alone, since it fetches no font", async () => {
    const html =
      '<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />';
    expect(await pinConsoleFonts(html)).toBe(html);
  });

  it("serves each pinned stylesheet with every face local", async () => {
    for (const local of Object.values(await pinnedConsoleFontStylesheets())) {
      const response = await servePinnedConsoleFont(local);
      const css = (await response?.text()) ?? "";
      expect(response?.headers.get("content-type")).toBe("text/css");
      expect(css).not.toContain("fonts.gstatic.com");
      const faces = [...css.matchAll(/url\(([^)]+)\)/g)].map((match) =>
        path.basename(match[1] ?? ""),
      );
      expect(faces.length).toBeGreaterThan(0);
      for (const face of faces)
        expect(existsSync(path.join(PINNED_CONSOLE_FONTS_DIR, face))).toBe(
          true,
        );
    }
  });

  it("serves a pinned face as a font, and nothing outside the fonts", async () => {
    const [local] = Object.values(await pinnedConsoleFontStylesheets());
    const css = await (await servePinnedConsoleFont(local ?? ""))?.text();
    const face = /url\(([^)]+)\)/.exec(css ?? "")?.[1] ?? "";
    const response = await servePinnedConsoleFont(face);
    expect(response?.headers.get("content-type")).toBe("font/woff2");
    expect((await response?.arrayBuffer())?.byteLength).toBeGreaterThan(0);
    expect(
      await servePinnedConsoleFont("/__visual/fonts/../baselines/x.png"),
    ).toBeUndefined();
    expect(await servePinnedConsoleFont("/studio")).toBeUndefined();
  });
});

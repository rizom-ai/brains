import { describe, expect, it } from "bun:test";
import defaultThemeCSS from "@rizom/theme-default";
import themeCSS, { themeCSSOnly, FONT_IMPORT_RE } from "../src";

describe("theme-rizom-ai", () => {
  it("layers over theme-default, minus the base's font imports", () => {
    // The base's Barlow/JetBrains/partial-Fraunces imports are its own
    // register; this theme owns its full font set instead.
    const baseWithoutFonts = defaultThemeCSS.replace(FONT_IMPORT_RE, "");
    expect(themeCSS.startsWith(baseWithoutFonts)).toBe(true);
    expect(themeCSS).toContain(themeCSSOnly);
  });

  it("ships exactly the rev-5 font set — no dead font requests", () => {
    // Family names may survive in overridden base var stacks (no request);
    // what must not survive is an @import fetching them.
    expect(themeCSS).not.toMatch(/@import[^\n]*Barlow/);
    expect(themeCSS).not.toMatch(/@import[^\n]*JetBrains/);
    expect(themeCSSOnly).toContain("IBM+Plex+Sans");
    expect(themeCSSOnly).toContain("IBM+Plex+Mono");
    // Fraunces with the full SOFT axis: the brain screens dial SOFT 20,
    // below the 30..100 slice the base theme requests.
    expect(themeCSSOnly).toContain(
      "family=Fraunces:ital,opsz,wght,SOFT@0,9..144,300..900,0..100",
    );
  });

  it("defines the rev-5 palette", () => {
    // Deep indigo ground, warm off-white, brass/ruby/moss accents
    expect(themeCSSOnly).toContain("#14132b");
    expect(themeCSSOnly).toContain("#0e0d20");
    expect(themeCSSOnly).toContain("#faf8f3");
    expect(themeCSSOnly).toContain("#d4af37");
    expect(themeCSSOnly).toContain("#e07a6a");
    expect(themeCSSOnly).toContain("#9caf88");
  });

  it("ships light mode as first-class", () => {
    expect(themeCSSOnly).toContain('[data-theme="light"]');
    // Light-mode ink text and adjusted brass
    expect(themeCSSOnly).toContain("#23213a");
    expect(themeCSSOnly).toContain("#a8821c");
  });

  it("scopes per-room accents via data-room", () => {
    expect(themeCSSOnly).toContain('[data-room="work"]');
    expect(themeCSSOnly).toContain('[data-room="foundation"]');
  });

  it("declares the brand utility slots the sections consume", () => {
    for (const slot of [
      "--font-display",
      "--font-body",
      "--font-label",
      "--text-display-lg",
      "--text-body-lg",
      "--text-label-sm",
      "--spacing-section",
    ]) {
      expect(themeCSSOnly).toContain(slot);
    }
  });

  it("styles CTAs with dark ink on brass (rev-5 button contract)", () => {
    expect(themeCSSOnly).toContain("--color-on-accent");
    expect(themeCSSOnly).toContain(
      "--rizom-btn-primary-color: var(--color-on-accent)",
    );
  });
});

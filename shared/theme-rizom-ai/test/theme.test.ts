import { describe, expect, it } from "bun:test";
import defaultThemeCSS from "@brains/theme-default";
import themeCSS, { themeCSSOnly } from "../src";

describe("theme-rizom-ai", () => {
  it("layers over theme-default", () => {
    expect(themeCSS.startsWith(defaultThemeCSS)).toBe(true);
    expect(themeCSS).toContain(themeCSSOnly);
  });

  it("imports the IBM Plex fonts the rev-5 system pairs with Fraunces", () => {
    expect(themeCSSOnly).toContain("IBM+Plex+Sans");
    expect(themeCSSOnly).toContain("IBM+Plex+Mono");
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

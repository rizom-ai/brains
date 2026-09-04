import { describe, expect, it } from "bun:test";
import {
  CONSOLE_CLIMATE_SCRIPT,
  CONSOLE_FONTS_URL,
  CONSOLE_THEME_CSS,
} from "../src";

function climateBlock(climate: string): string {
  const match = CONSOLE_THEME_CSS.match(
    new RegExp(`\\[data-climate="${climate}"\\] \\{(?<body>[\\s\\S]*?)\\n\\}`),
  );
  const body = match?.groups?.["body"];
  if (body === undefined) {
    throw new Error(`No [data-climate="${climate}"] block in the sheet`);
  }
  return body;
}

function tokenNames(block: string): Set<string> {
  return new Set(
    [...block.matchAll(/(--console-[a-z-]+)\s*:/g)].map((m) => m[1] ?? ""),
  );
}

describe("CONSOLE_THEME_CSS", () => {
  it("defines the identical token set in both climates", () => {
    const instrument = tokenNames(climateBlock("instrument"));
    const paper = tokenNames(climateBlock("paper"));

    expect(instrument.size).toBeGreaterThan(0);
    expect([...instrument].sort()).toEqual([...paper].sort());
  });

  it("resolves the shared font tokens to the console type ramp", () => {
    expect(CONSOLE_THEME_CSS).toMatch(/--console-display:[^;]*Fraunces/);
    expect(CONSOLE_THEME_CSS).toMatch(/--console-ui:[^;]*IBM Plex Sans/);
    expect(CONSOLE_THEME_CSS).toMatch(/--console-mono:[^;]*JetBrains Mono/);
  });

  it("aliases both climates to the injected semantic theme", () => {
    for (const climate of ["instrument", "paper"]) {
      const block = climateBlock(climate);
      expect(block).toContain("--console-bg: var(--color-bg)");
      expect(block).toContain("--console-accent: var(--color-accent)");
      expect(block).toContain("--console-warn: var(--color-warning)");
      expect(block).not.toMatch(/#[0-9a-f]{3,8}|rgba?\(/i);
    }
  });

  it("uses contract tokens rather than theme-private palette values", () => {
    for (const climate of ["instrument", "paper"]) {
      const block = climateBlock(climate);
      expect(block).not.toContain("--palette-");
      expect(block).not.toContain("--color-warning-text-emphasis");
      expect(block).not.toContain("--color-bg-dark");
    }
  });

  it("sets the matching color-scheme per climate", () => {
    expect(climateBlock("instrument")).toContain("color-scheme: dark");
    expect(climateBlock("paper")).toContain("color-scheme: light");
  });

  it("carries no obsolete cross-product strip chrome", () => {
    for (const selector of [
      ".console-strip",
      ".console-mark",
      ".surface-nav-link",
      ".session-chip",
      "@keyframes console-pulse",
    ]) {
      expect(CONSOLE_THEME_CSS).not.toContain(selector);
    }
    expect(CONSOLE_THEME_CSS).toContain("--console-touch: 44px");
  });

  it("turns the command palette into a dynamic-viewport phone sheet", () => {
    expect(CONSOLE_THEME_CSS).toContain("height: 100dvh");
    expect(CONSOLE_THEME_CSS).toContain("env(safe-area-inset-bottom)");
    expect(CONSOLE_THEME_CSS).toContain(".cp-glyph");
    expect(CONSOLE_THEME_CSS).toContain(".cp-group + .cp-group");
  });

  it("loads the shared ramp and the Studio editorial mono face", () => {
    expect(CONSOLE_FONTS_URL).toContain("Fraunces");
    expect(CONSOLE_FONTS_URL).toContain("IBM+Plex+Sans");
    expect(CONSOLE_FONTS_URL).toContain("JetBrains+Mono");
    expect(CONSOLE_FONTS_URL).toContain("IBM+Plex+Mono");
  });

  it("styles chrome only from console tokens", () => {
    // The strip is shared across server-rendered and client surfaces; any reference
    // to a surface-private variable would break the non-dashboard hosts.
    expect(CONSOLE_THEME_CSS).not.toMatch(/var\(--dashboard-/);
    expect(CONSOLE_THEME_CSS).not.toMatch(/var\(--chat-/);
    expect(CONSOLE_THEME_CSS).not.toMatch(/var\(--(ink|paper|rule|accent)\b/);
  });
});

describe("CONSOLE_CLIMATE_SCRIPT", () => {
  it("applies the stored climate immediately but binds the toggle after parse", () => {
    // The script runs from <head> before each surface-owned toggle exists;
    // binding must wait for DOMContentLoaded.
    expect(CONSOLE_CLIMATE_SCRIPT).toContain(
      'localStorage.getItem("console.climate")',
    );
    expect(CONSOLE_CLIMATE_SCRIPT).toContain("DOMContentLoaded");
  });

  it("labels the toggle by destination climate instead of setting text labels", () => {
    expect(CONSOLE_CLIMATE_SCRIPT).toContain("aria-label");
    expect(CONSOLE_CLIMATE_SCRIPT).not.toContain("Paper mode");
  });
});

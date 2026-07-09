import { describe, expect, it } from "bun:test";
import { CONSOLE_FONTS_URL, CONSOLE_THEME_CSS } from "../src";

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

  it("keeps instrument values fixed and paper values theme-adaptive", () => {
    // Instrument is the console's own identity; paper follows an injected
    // site theme (shell themeCSS) when present, falling back to the CMS
    // editor's paper values.
    expect(climateBlock("instrument")).not.toContain("--color-");
    expect(climateBlock("paper")).toContain("var(--color-bg");
    expect(climateBlock("paper")).toContain("var(--color-accent");
  });

  it("does not reuse dark inverse backgrounds in the paper climate", () => {
    expect(climateBlock("paper")).not.toContain("--color-bg-dark");
  });

  it("sets the matching color-scheme per climate", () => {
    expect(climateBlock("instrument")).toContain("color-scheme: dark");
    expect(climateBlock("paper")).toContain("color-scheme: light");
  });

  it("carries the console strip's chrome styles", () => {
    for (const selector of [
      ".console-strip",
      ".console-mark",
      ".surface-nav-link.is-active",
      ".command-chip",
      ".session-chip",
      ".pulse",
      "@keyframes pulse",
    ]) {
      expect(CONSOLE_THEME_CSS).toContain(selector);
    }
  });

  it("loads exactly the console type ramp from the fonts URL", () => {
    expect(CONSOLE_FONTS_URL).toContain("Fraunces");
    expect(CONSOLE_FONTS_URL).toContain("IBM+Plex+Sans");
    expect(CONSOLE_FONTS_URL).toContain("JetBrains+Mono");
    expect(CONSOLE_FONTS_URL).not.toContain("IBM+Plex+Mono");
  });

  it("styles chrome only from console tokens", () => {
    // The strip is shared across Preact and React surfaces; any reference
    // to a surface-private variable would break the non-dashboard hosts.
    expect(CONSOLE_THEME_CSS).not.toMatch(/var\(--dashboard-/);
    expect(CONSOLE_THEME_CSS).not.toMatch(/var\(--chat-/);
    expect(CONSOLE_THEME_CSS).not.toMatch(/var\(--(ink|paper|rule|accent)\b/);
  });
});

import { describe, expect, it } from "bun:test";
import {
  CONSOLE_CLIMATE_SCRIPT,
  CONSOLE_FONTS_URL,
  CONSOLE_THEME_CSS,
  renderConsoleStripHtml,
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

  it("keeps instrument values fixed and paper values theme-adaptive", () => {
    // Instrument is the console's own identity; paper follows an injected
    // site theme (shell themeCSS) when present, falling back to the CMS
    // editor's paper values.
    const instrument = climateBlock("instrument");
    expect(instrument).not.toContain("--color-");
    expect(instrument).toContain("--console-bg: #0a0819");
    expect(instrument).toContain("--console-accent: #ff8b3d");
    expect(climateBlock("paper")).toContain("var(--color-bg");
    expect(climateBlock("paper")).toContain("var(--color-accent");
  });

  it("does not reuse dark-only tokens in the paper climate", () => {
    const paper = climateBlock("paper");
    expect(paper).not.toContain("--color-bg-dark");
    expect(paper).not.toContain("var(--color-warning-text-emphasis,");
    expect(paper).toContain("--palette-warning-text-emphasis-light");
    expect(paper).toContain("#7a4a05");
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
      ".climate-chip",
      ".session-chip",
      ".pulse",
      "@keyframes console-pulse",
    ]) {
      expect(CONSOLE_THEME_CSS).toContain(selector);
    }
  });

  it("defines deliberate tablet and phone chrome instead of flex wrapping", () => {
    expect(CONSOLE_THEME_CSS).toContain("@media (max-width: 900px)");
    expect(CONSOLE_THEME_CSS).toContain("@media (max-width: 640px)");
    expect(CONSOLE_THEME_CSS).toContain(
      'grid-template-areas:\n      "mark command climate session"',
    );
    expect(CONSOLE_THEME_CSS).toContain("--console-touch: 44px");
    expect(CONSOLE_THEME_CSS).not.toContain("flex-wrap: wrap");
  });

  it("turns the command palette into a dynamic-viewport phone sheet", () => {
    expect(CONSOLE_THEME_CSS).toContain("height: 100dvh");
    expect(CONSOLE_THEME_CSS).toContain("env(safe-area-inset-bottom)");
    expect(CONSOLE_THEME_CSS).toContain(".cp-glyph");
    expect(CONSOLE_THEME_CSS).toContain(".cp-group + .cp-group");
  });

  it("loads the shared ramp and the CMS editorial mono face", () => {
    expect(CONSOLE_FONTS_URL).toContain("Fraunces");
    expect(CONSOLE_FONTS_URL).toContain("IBM+Plex+Sans");
    expect(CONSOLE_FONTS_URL).toContain("JetBrains+Mono");
    expect(CONSOLE_FONTS_URL).toContain("IBM+Plex+Mono");
  });

  it("styles chrome only from console tokens", () => {
    // The strip is shared across Preact and React surfaces; any reference
    // to a surface-private variable would break the non-dashboard hosts.
    expect(CONSOLE_THEME_CSS).not.toMatch(/var\(--dashboard-/);
    expect(CONSOLE_THEME_CSS).not.toMatch(/var\(--chat-/);
    expect(CONSOLE_THEME_CSS).not.toMatch(/var\(--(ink|paper|rule|accent)\b/);
  });
});

describe("renderConsoleStripHtml", () => {
  const surfaces = [
    { id: "dashboard", label: "Dashboard", href: "/", isActive: false },
    { id: "cms", label: "CMS", href: "/cms", isActive: true },
  ];

  it("uses role-neutral authenticated-session copy", () => {
    const html = renderConsoleStripHtml({ surfaces, sessionHref: "/logout" });

    expect(html).toContain("Authenticated");
    expect(html).not.toContain("Operator");
  });

  it("renders the climate toggle between search and session", () => {
    const html = renderConsoleStripHtml({ surfaces, sessionHref: "/logout" });

    expect(html).toContain('id="climateToggle"');
    expect(html).toContain('class="climate-chip"');
    expect(html.indexOf("command-chip")).toBeLessThan(
      html.indexOf("climate-chip"),
    );
    expect(html.indexOf("climate-chip")).toBeLessThan(
      html.indexOf("session-chip"),
    );
  });
});

describe("CONSOLE_CLIMATE_SCRIPT", () => {
  it("applies the stored climate immediately but binds the toggle after parse", () => {
    // The script runs from <head> on chat and the CMS, before the strip
    // exists in the DOM; binding must wait for DOMContentLoaded there.
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

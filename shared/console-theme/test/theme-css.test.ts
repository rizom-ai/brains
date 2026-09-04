import { describe, expect, it } from "bun:test";
import { resolveConsoleThemeCSS } from "../src";

describe("resolveConsoleThemeCSS", () => {
  it("uses the composed app theme when the runtime has none", () => {
    const css = resolveConsoleThemeCSS("");

    expect(css).toContain("THEME BASE");
    expect(css).toContain("Neutral default for app shells");
    expect(css).toContain("--color-bg-card");
  });

  it("preserves a runtime-resolved theme", () => {
    const css = resolveConsoleThemeCSS(
      '@import url("https://fonts.googleapis.com/css2?family=Test");\n.rule { color: plum; }',
    );

    expect(css).toContain(".rule { color: plum; }");
    expect(css).not.toContain("Neutral default for app shells");
  });

  it("hoists font imports ahead of the composed base rules", () => {
    const css = resolveConsoleThemeCSS();
    const firstRule = css.indexOf("@import url(");
    const baseRule = css.indexOf("@layer theme-base");

    expect(firstRule).toBe(0);
    expect(baseRule).toBeGreaterThan(firstRule);
    expect(css.slice(baseRule)).not.toContain("@import url(");
  });

  it("can remove remote imports for shells with a no-third-party policy", () => {
    const css = resolveConsoleThemeCSS(undefined, { imports: "remove" });

    expect(css).not.toContain("@import url(");
    expect(css).toContain("--color-bg-card");
  });
});

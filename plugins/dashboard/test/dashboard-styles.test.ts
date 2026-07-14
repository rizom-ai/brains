import { describe, expect, it } from "bun:test";
import { CONSOLE_THEME_CSS } from "@brains/console-theme";
import { DASHBOARD_STYLES } from "../src/render/styles";

describe("DASHBOARD_STYLES", () => {
  it("embeds the shared console token sheet", () => {
    expect(DASHBOARD_STYLES).toContain(CONSOLE_THEME_CSS);
  });

  it("defines no surface-private palette", () => {
    // The sheet is the single source: the dashboard neither defines
    // --dashboard-* tokens nor redefines any --console-* token locally.
    const localStyles = DASHBOARD_STYLES.replace(CONSOLE_THEME_CSS, "");
    expect(localStyles).not.toMatch(/--dashboard-[a-z-]+\s*:/);
    expect(localStyles).not.toMatch(/--console-[a-z-]+\s*:/);
  });

  it("styles components from console tokens, not legacy aliases", () => {
    const localStyles = DASHBOARD_STYLES.replace(CONSOLE_THEME_CSS, "");
    expect(localStyles).not.toMatch(/var\(--(ink|paper|rule|accent)[),-]/);
    expect(localStyles).toContain("var(--console-text");
  });

  it("scopes light styling to the paper climate", () => {
    expect(DASHBOARD_STYLES).not.toContain('[data-theme="light"]');
    expect(DASHBOARD_STYLES).toContain('[data-climate="paper"]');
  });

  it("carries the strip chrome only via the sheet", () => {
    const localStyles = DASHBOARD_STYLES.replace(CONSOLE_THEME_CSS, "");
    expect(localStyles).not.toContain(".console-strip");
    expect(localStyles).not.toContain(".session-chip");
  });

  it("centers People dialogs in the viewport despite the global reset", () => {
    const dialogRule = DASHBOARD_STYLES.match(
      /\.people-dialog\s*\{([^}]*)\}/,
    )?.[1];

    expect(dialogRule).toContain("position: fixed");
    expect(dialogRule).toContain("inset: 0");
    expect(dialogRule).toContain("margin: auto");
    expect(dialogRule).toContain("max-height: calc(100dvh - 32px)");
    expect(dialogRule).toContain("overflow-y: auto");
  });

  it("ships a phone composition for tabs, vitals, and job rows", () => {
    expect(DASHBOARD_STYLES).toContain("@media (max-width: 640px)");
    expect(DASHBOARD_STYLES).toContain("overscroll-behavior-inline: contain");
    expect(DASHBOARD_STYLES).toContain(
      '.jobs td:nth-child(1)::before { content: "Job"; }',
    );
  });
});

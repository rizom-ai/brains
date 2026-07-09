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
});

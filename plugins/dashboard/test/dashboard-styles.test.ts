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

  it("provides generic widget action, tab, and filter primitives", () => {
    expect(DASHBOARD_STYLES).toMatch(/\.widget-tabs[,\s{]/);
    expect(DASHBOARD_STYLES).toMatch(/\.widget-tab[,\s{]/);
    expect(DASHBOARD_STYLES).toMatch(/\.widget-filter-tabs[,\s{]/);
    expect(DASHBOARD_STYLES).toMatch(/\.widget-filter-tab[,\s{]/);
    expect(DASHBOARD_STYLES).toMatch(/\.widget-actions[,\s{]/);
    expect(DASHBOARD_STYLES).toMatch(/\.widget-action[,\s{]/);
  });

  it("contains no styles for the removed identity card", () => {
    expect(DASHBOARD_STYLES).not.toContain(".identity-card");
    expect(DASHBOARD_STYLES).not.toContain(".identity-role");
    expect(DASHBOARD_STYLES).not.toContain(".identity-purpose");
  });

  it("contains no entity-owned widget styles", () => {
    expect(DASHBOARD_STYLES).not.toMatch(
      /\.(?:swot|agent-network|proximity)[a-z-]*/,
    );
    expect(DASHBOARD_STYLES).not.toContain("data-agent-network");
  });

  it("ships a phone composition for tabs, vitals, and job rows", () => {
    expect(DASHBOARD_STYLES).toContain("@media (max-width: 640px)");
    expect(DASHBOARD_STYLES).toContain("overscroll-behavior-inline: contain");
    expect(DASHBOARD_STYLES).toMatch(
      /\.jobs td:nth-child\(1\)::before\s*{\s*content: "Job";/,
    );
  });
});

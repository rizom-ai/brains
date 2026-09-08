import { describe, expect, it } from "bun:test";
import { operatorViewStylexCSS } from "@brains/operator-view-react";
import { CONSOLE_THEME_CSS } from "@brains/console-theme";
import { DASHBOARD_STYLES } from "../src/render/styles";

describe("DASHBOARD_STYLES", () => {
  it("delivers compiled shared facts without a legacy selector fallback", () => {
    expect(operatorViewStylexCSS.length).toBeGreaterThan(50);
    expect(DASHBOARD_STYLES).toContain(operatorViewStylexCSS);
    expect(DASHBOARD_STYLES).not.toContain(".declarative-key-values");
    expect(DASHBOARD_STYLES).not.toContain(".declarative-notice");
  });
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

  it("carries public chrome without the retired console strip", () => {
    expect(DASHBOARD_STYLES).not.toContain(".public-header");
    expect(DASHBOARD_STYLES).not.toMatch(
      /\.(masthead|brand|tagline|tab-badge)[\s.{:-]/,
    );
    expect(DASHBOARD_STYLES).not.toMatch(/\.dashboard-tabs?[\s.{:]/);
    expect(operatorViewStylexCSS).toContain("aria-selected");
    expect(DASHBOARD_STYLES).not.toContain(".console-strip");
    expect(DASHBOARD_STYLES).not.toContain(".session-chip");
  });

  it("uses compiled overview copy, summaries, and totals without a legacy stylesheet", () => {
    expect(DASHBOARD_STYLES).not.toMatch(
      /\.public-(identity-card|card-rows|card-pulse|card-empty|holdings)[\s.{:>]/,
    );
    expect(operatorViewStylexCSS).toContain(
      "grid-template-columns:repeat(4,minmax(0,1fr))",
    );
  });

  it("has no remaining System-specific stylesheet selectors", () => {
    expect(DASHBOARD_STYLES).not.toMatch(/\.system-[a-z-]+[\s.{:,>]/);
  });

  it("uses shared compiled panel columns, reference facts, and availability rows", () => {
    expect(DASHBOARD_STYLES).not.toMatch(
      /\.system-(layout|main|side|kv)[\s.{:,>]/,
    );
    expect(DASHBOARD_STYLES).not.toMatch(/\.system-surfaces-card\s+(ul|li)/);
    expect(operatorViewStylexCSS).toContain("grid-column:1 / -1");
  });

  it("uses compiled panel framing and headings instead of global card selectors", () => {
    expect(DASHBOARD_STYLES).not.toMatch(
      /\.(card|card-head|card-title|card-from|card-subtitle)[\s.{:,]/,
    );
    expect(operatorViewStylexCSS).toContain("container-name:operator-panel");
    expect(operatorViewStylexCSS).toContain("container-type:inline-size");
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

  it("hosts the public knowledge and proximity map language", () => {
    expect(DASHBOARD_STYLES).toContain(".knowledge-map-field");
    expect(DASHBOARD_STYLES).toContain(".proximity-map-field");
    expect(DASHBOARD_STYLES).toContain(".knowledge-zone");
    expect(DASHBOARD_STYLES).toContain(".knowledge-atlas-summary");
    expect(DASHBOARD_STYLES).toContain(".knowledge-territory-index");
    expect(DASHBOARD_STYLES).not.toContain(".knowledge-point-glow");
    expect(DASHBOARD_STYLES).not.toContain(".map-count");
    expect(DASHBOARD_STYLES).toContain(".proximity-node");
    expect(DASHBOARD_STYLES).not.toContain("data-agent-network");
  });

  it("uses shared compiled framing, sections, and footer without legacy selectors", () => {
    const localStyles = DASHBOARD_STYLES.replace(CONSOLE_THEME_CSS, "");
    expect(localStyles).not.toMatch(
      /\.(console|frame|canvas|colophon|colophon-mark|colophon-actions|dashboard-tab-panels|dashboard-tab-panel|tab-section-head)[\s.{:[,]/,
    );
    expect(operatorViewStylexCSS).toContain("width:min(1280px,96vw)");
    expect(operatorViewStylexCSS).toContain("data-ui-tabs-active");
    expect(DASHBOARD_STYLES).not.toContain(".public-contributions");
    expect(DASHBOARD_STYLES).not.toContain(".public-values");
  });

  it("ships phone compositions for tabs, card rows, and maps", () => {
    expect(DASHBOARD_STYLES).toContain("@media (max-width: 640px)");
    expect(DASHBOARD_STYLES).toMatch(/overscroll-behavior-inline:\s*contain/);
    expect(DASHBOARD_STYLES).not.toContain(".public-card-grid");
    expect(DASHBOARD_STYLES).toContain(".map-field svg");
  });
});

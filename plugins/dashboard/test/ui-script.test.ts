import { describe, expect, it } from "bun:test";
import { DASHBOARD_UI_SCRIPT } from "../src/render/ui-script";

describe("DASHBOARD_UI_SCRIPT", () => {
  it("enhances owner-scoped tab sets without widget coupling", () => {
    expect(DASHBOARD_UI_SCRIPT).toContain('"[data-ui-tabs]"');
    expect(DASHBOARD_UI_SCRIPT).toContain('"[data-ui-tab]"');
    expect(DASHBOARD_UI_SCRIPT).toContain('"[data-ui-panel]"');
    expect(DASHBOARD_UI_SCRIPT).toContain(
      "node.closest(rootSelector) === root",
    );
    expect(DASHBOARD_UI_SCRIPT).not.toContain("data-recent-memory");
    expect(DASHBOARD_UI_SCRIPT).not.toContain("data-agent-network");
  });

  it("supports hash-backed dashboard tabs and local widget tabs", () => {
    expect(DASHBOARD_UI_SCRIPT).toContain("data-ui-tabs-hash");
    expect(DASHBOARD_UI_SCRIPT).toContain("window.history.pushState");
    expect(DASHBOARD_UI_SCRIPT).toContain('toggleAttribute("hidden"');
    expect(DASHBOARD_UI_SCRIPT).toContain('setAttribute("aria-selected"');
  });

  it("enhances owner-scoped list filters", () => {
    expect(DASHBOARD_UI_SCRIPT).toContain('"[data-ui-filter]"');
    expect(DASHBOARD_UI_SCRIPT).toContain('"[data-ui-filter-value]"');
    expect(DASHBOARD_UI_SCRIPT).toContain('"[data-ui-filter-values]"');
    expect(DASHBOARD_UI_SCRIPT).toContain('setAttribute("aria-pressed"');
  });
});

import { describe, expect, it } from "bun:test";
import { DASHBOARD_TABS_SCRIPT } from "../src/render/tabs-script";

describe("DASHBOARD_TABS_SCRIPT", () => {
  it("enhances any owned tab set without coupling to widget selectors", () => {
    expect(DASHBOARD_TABS_SCRIPT).toContain('"[data-ui-tabs]"');
    expect(DASHBOARD_TABS_SCRIPT).toContain('"[data-ui-tab]"');
    expect(DASHBOARD_TABS_SCRIPT).toContain('"[data-ui-panel]"');
    expect(DASHBOARD_TABS_SCRIPT).toContain(
      'node.closest("[data-ui-tabs]") === root',
    );
    expect(DASHBOARD_TABS_SCRIPT).not.toContain("data-recent-memory");
    expect(DASHBOARD_TABS_SCRIPT).not.toContain("data-agent-network");
  });

  it("supports hash-backed dashboard tabs and local widget tabs", () => {
    expect(DASHBOARD_TABS_SCRIPT).toContain("data-ui-tabs-hash");
    expect(DASHBOARD_TABS_SCRIPT).toContain("window.history.pushState");
    expect(DASHBOARD_TABS_SCRIPT).toContain('toggleAttribute("hidden"');
    expect(DASHBOARD_TABS_SCRIPT).toContain('setAttribute("aria-selected"');
  });
});

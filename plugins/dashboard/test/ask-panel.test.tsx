import { describe, expect, test } from "bun:test";
import { ASK_STYLED_ATTRIBUTE } from "@brains/contracts";
import { createMockAppInfo } from "@brains/plugins/test";
import {
  renderDashboardPageHtml,
  type DashboardRenderInput,
} from "../src/dashboard-page";

const input: DashboardRenderInput = {
  title: "Test Brain",
  baseUrl: "https://brain.test",
  character: { role: "", purpose: "", values: [] },
  profile: { name: "Test Brain" },
  appInfo: createMockAppInfo(),
  widgets: {},
};
describe("optional public Ask tab", () => {
  test("is absent by default, including its client assets", () => {
    const html = renderDashboardPageHtml(input);
    expect(html).not.toContain('id="dashboard-tab-ask"');
    expect(html).not.toContain("/ask/assets/dashboard.");
  });
  test("hosts Web Chat without copying copy, runtime or mockup controls", () => {
    const html = renderDashboardPageHtml({ ...input, askEnabled: true });
    expect(html).toContain('id="dashboard-tab-ask"');
    expect(html).toContain("data-guest-dashboard");
    expect(html).toContain(`${ASK_STYLED_ATTRIBUTE}=""`);
    expect(html).toContain("/ask/assets/dashboard.js");
    expect(html).toContain("/ask/assets/dashboard.css");
    expect(html).not.toContain("mock-enable");
    expect(html).not.toContain("What’s on your mind?");
    expect(html).toContain('data-ui-tabs-default="overview"');
    expect(html).toContain('class="public-card-grid');
  });
});

/** @jsxImportSource preact */
import { describe, expect, it } from "bun:test";
import type { DashboardWidgetRegistration } from "@brains/plugins";
import { render } from "preact-render-to-string";

import {
  UnifiedInboxDashboardWidget,
  inboxDashboardDataSchema,
  registerUnifiedInboxDashboardWidget,
} from "../src";

const dashboardData = inboxDashboardDataSchema.parse({
  summary: {
    open: 2,
    high: 1,
    availableSources: 2,
    unavailableSources: 1,
  },
  entries: [
    {
      sourceLabel: "Email Triage",
      urgency: "high",
      title: "Time-sensitive work request",
      receivedAt: "2026-08-05T09:00:00.000Z",
    },
    {
      sourceLabel: "Candidates",
      urgency: "normal",
      title: "Possible collaborator",
      receivedAt: "2026-08-05T08:00:00.000Z",
    },
  ],
  managementUrl: "/studio/workspaces/inbox",
});

describe("UnifiedInboxDashboardWidget", () => {
  it("renders a read-only attention preview and workspace link", () => {
    const html = render(<UnifiedInboxDashboardWidget data={dashboardData} />);

    expect(html).toContain("Email Triage");
    expect(html).toContain("Candidates");
    expect(html).toContain("Time-sensitive work request");
    expect(html).toContain("pill--warn");
    expect(html).toContain(">high<");
    expect(html).toContain("Open Inbox");
    expect(html).toContain('href="/studio/workspaces/inbox"');
    expect(html).not.toContain("data-inbox-action");
    expect(html).not.toContain("A project contact asks");
  });

  it("renders the no-CMS conversational fallback without controls", () => {
    const html = render(
      <UnifiedInboxDashboardWidget
        data={{
          summary: {
            open: 0,
            high: 0,
            availableSources: 1,
            unavailableSources: 0,
          },
          entries: [],
        }}
      />,
    );

    expect(html).toContain("Inbox clear");
    expect(html).toContain("Browser triage is unavailable");
    expect(html).toContain("inbox_list");
    expect(html).not.toContain("Open Inbox");
  });

  it("registers an Admin widget with redacted data and attention digest", async () => {
    let registration: DashboardWidgetRegistration | undefined;
    await registerUnifiedInboxDashboardWidget(
      {
        dashboard: {
          registerWidget: async (widget) => {
            registration = widget;
          },
        },
      },
      { dashboard: async () => dashboardData },
      "/studio/workspaces/inbox",
    );

    expect(registration).toMatchObject({
      id: "inbox",
      title: "Inbox",
      group: "communication",
      section: "primary",
      rendererName: "CustomWidget",
      visibility: "admin",
      component: UnifiedInboxDashboardWidget,
    });
    if (!registration) throw new Error("Inbox widget was not registered");
    expect(await registration.dataProvider()).toEqual(dashboardData);
    expect(registration.digestProvider?.(dashboardData)).toEqual({
      digest: [
        { label: "Open", value: "2", tone: "warn" },
        { label: "High priority", value: "1", tone: "warn" },
        { label: "Sources online", value: "2/3" },
      ],
      needsAttention: 1,
    });
    expect(registration.clientStyles).toContain(".unified-inbox-widget");
    expect(registration.clientScript).toBeUndefined();
  });
});

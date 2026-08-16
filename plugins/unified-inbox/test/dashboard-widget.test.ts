import { describe, expect, it } from "bun:test";
import {
  DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
  type DashboardWidgetRegistration,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import {
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
});

describe("Unified Inbox declarative Dashboard widget", () => {
  it("registers an Admin widget with normalized data and attention digest", async () => {
    const harness = createPluginHarness();
    let registration: DashboardWidgetRegistration | undefined;
    harness.subscribe<DashboardWidgetRegistration>(
      "dashboard:register-widget",
      async (message) => {
        registration = message.payload;
        return { success: true };
      },
    );
    await registerUnifiedInboxDashboardWidget(
      harness.getServiceContext("unified-inbox"),
      { dashboard: async () => dashboardData },
    );

    expect(registration).toMatchObject({
      id: "inbox",
      title: "Inbox",
      group: "communication",
      section: "primary",
      rendererName: DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
      visibility: "admin",
    });
    if (!registration) throw new Error("Inbox widget was not registered");
    const normalized = await registration.dataProvider({
      caller: {
        actor: { id: "user:admin" },
        permission: "admin",
        isAnchor: true,
      },
      signal: new AbortController().signal,
    });
    expect(normalized).toMatchObject({
      view: {
        blocks: [
          { type: "stats" },
          { type: "list" },
          { type: "notice" },
          {
            type: "links",
            items: [
              {
                target: {
                  kind: "launch",
                  launch: { target: "inbox" },
                },
              },
            ],
          },
        ],
      },
    });
    expect(registration.digestProvider?.(normalized)).toEqual({
      digest: [
        { label: "Open", value: "2", tone: "warn" },
        { label: "High priority", value: "1", tone: "warn" },
        { label: "Sources online", value: "2/3", tone: "plain" },
      ],
      needsAttention: 1,
    });
  });
});

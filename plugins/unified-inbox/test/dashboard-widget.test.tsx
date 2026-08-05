/** @jsxImportSource preact */
import { describe, expect, it } from "bun:test";
import type { DashboardWidgetRegistration } from "@brains/plugins";
import { render } from "preact-render-to-string";

import {
  INBOX_ACTION_PATH,
  UnifiedInboxDashboardWidget,
  inboxProjectionSchema,
  registerUnifiedInboxDashboardWidget,
} from "../src";

const projection = inboxProjectionSchema.parse({
  entries: [
    {
      source: { sourceId: "mail-items", displayName: "Email Triage" },
      item: {
        id: "mail-high",
        title: "Time-sensitive work request",
        summary: "A project contact asks for a decision this week.",
        receivedAt: "2026-08-05T09:00:00.000Z",
        urgency: "high",
        entityRef: { entityType: "mail-item", entityId: "mail-high" },
        actions: [
          { id: "mark-reviewed", label: "Mark reviewed" },
          { id: "archive", label: "Archive", confirm: true },
        ],
      },
    },
    {
      source: { sourceId: "agent-candidates", displayName: "Candidates" },
      item: {
        id: "candidate-1",
        title: "Possible collaborator",
        receivedAt: "2026-08-05T08:00:00.000Z",
        urgency: "normal",
        actions: [{ id: "ignore", label: "Ignore" }],
      },
    },
  ],
  errors: [
    {
      source: { sourceId: "stale-work", displayName: "Stale work" },
      error: "Source unavailable",
    },
  ],
});

describe("UnifiedInboxDashboardWidget", () => {
  it("renders grouped attention items, urgency, source failures, and action controls", () => {
    const html = render(<UnifiedInboxDashboardWidget data={projection} />);

    expect(html).toContain("Email Triage");
    expect(html).toContain("Candidates");
    expect(html).toContain("Time-sensitive work request");
    expect(html).toContain("Possible collaborator");
    expect(html).toContain("high priority");
    expect(html).toContain("Stale work unavailable");
    expect(html).toContain('data-inbox-action-id="mark-reviewed"');
    expect(html).toContain('data-inbox-action-id="archive"');
    expect(html).toContain('data-inbox-confirm="true"');
    expect(html).toContain(`data-inbox-action-url="${INBOX_ACTION_PATH}"`);
  });

  it("renders a stable empty state", () => {
    const html = render(
      <UnifiedInboxDashboardWidget data={{ entries: [], errors: [] }} />,
    );

    expect(html).toContain("Inbox clear");
    expect(html).not.toContain("data-inbox-action-id");
  });

  it("registers an Admin widget with live data and attention digest", async () => {
    let registration: DashboardWidgetRegistration | undefined;
    await registerUnifiedInboxDashboardWidget(
      {
        dashboard: {
          registerWidget: async (widget) => {
            registration = widget;
          },
        },
      },
      { getInboxData: async () => projection },
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
    expect(await registration.dataProvider()).toEqual(projection);
    expect(registration.digestProvider?.(projection)).toEqual({
      digest: [
        { label: "Open", value: "2", tone: "warn" },
        { label: "High priority", value: "1", tone: "warn" },
        { label: "Sources", value: "2" },
      ],
      needsAttention: 1,
    });
    expect(registration.clientStyles).toContain(".unified-inbox-source");
    expect(registration.clientScript).toContain("window.confirm");
    expect(registration.clientScript).toContain(INBOX_ACTION_PATH);
  });
});

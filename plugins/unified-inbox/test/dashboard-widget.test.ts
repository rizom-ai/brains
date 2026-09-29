import { describe, expect, it } from "bun:test";
import {
  DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
  type DashboardWidgetRegistration,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import type { InboxItem } from "@brains/plugins";
import { createUnifiedInboxPlugin } from "./install";

function item(
  id: string,
  urgency: "high" | "normal",
  receivedAt: string,
): InboxItem {
  return {
    id,
    title: id === "mail-high" ? "Time-sensitive work request" : id,
    receivedAt,
    urgency,
    actions: [],
  };
}

/**
 * Two sources that answer and one that cannot, which is what makes the
 * unavailable notice and the "2 of 3 online" count real rather than fixture
 * data handed straight to the view.
 */
function registerSources(
  registry: ReturnType<
    ReturnType<typeof createPluginHarness>["getMockShell"]
  >["getInboxRegistry"] extends () => infer R
    ? R
    : never,
): void {
  registry.registerSource("mail-plugin", {
    sourceId: "mail-items",
    displayName: "Email Triage",
    list: async () => [item("mail-high", "high", "2026-08-05T09:00:00.000Z")],
    act: async () => undefined,
  });
  registry.registerSource("candidates-plugin", {
    sourceId: "candidates",
    displayName: "Candidates",
    list: async () => [
      item("Possible collaborator", "normal", "2026-08-05T08:00:00.000Z"),
    ],
    act: async () => undefined,
  });
  registry.registerSource("offline-plugin", {
    sourceId: "offline",
    displayName: "Offline",
    list: async () => {
      throw new Error("source unavailable");
    },
    act: async () => undefined,
  });
}

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
    registerSources(harness.getMockShell().getInboxRegistry());
    const plugin = createUnifiedInboxPlugin();
    await harness.installPlugin(plugin);
    await harness.finalizeRegistration();

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

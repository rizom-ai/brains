import { describe, expect, it } from "bun:test";
import { DASHBOARD_CHANNELS } from "@brains/contracts";
import {
  safeParseRuntimeDashboardWidgetData,
  type DashboardWidgetRegistration,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import {
  registerEmailTriageDashboardWidget,
  type MailTriageSummary,
} from "../src";

const summary: MailTriageSummary = {
  new: 4,
  high: 2,
  needsReply: 3,
  unclassified: 1,
};

function dashboardReadContext(): {
  caller: {
    actor: { id: string };
    permission: "admin";
    isAnchor: true;
  };
  signal: AbortSignal;
} {
  return {
    caller: {
      actor: { id: "user:admin" },
      permission: "admin",
      isAnchor: true,
    },
    signal: new AbortController().signal,
  };
}

function registerInboxInteraction(
  harness: ReturnType<typeof createPluginHarness>,
  href = "/studio/workspaces/inbox",
): void {
  harness.getMockShell().registerInteraction({
    id: "unified-inbox",
    label: "Inbox",
    description: "Review source-owned items that need operator attention.",
    href,
    kind: "admin",
    pluginId: "unified-inbox",
    priority: 20,
    visibility: "admin",
  });
}

async function captureWidget(input: {
  interaction: "before" | "after" | "never";
  href?: string;
}): Promise<DashboardWidgetRegistration> {
  const harness = createPluginHarness();
  let registration: DashboardWidgetRegistration | undefined;
  harness.subscribe<DashboardWidgetRegistration>(
    DASHBOARD_CHANNELS.registerWidget,
    async (message) => {
      registration = message.payload;
      return { success: true };
    },
  );
  if (input.interaction === "before") {
    registerInboxInteraction(harness, input.href);
  }
  await registerEmailTriageDashboardWidget(
    harness.getServiceContext("email-workflows"),
    { summary: async () => summary },
  );
  if (input.interaction === "after") {
    registerInboxInteraction(harness, input.href);
  }
  if (!registration) throw new Error("Email triage widget was not registered");
  return registration;
}

describe("Email triage declarative Dashboard widget", () => {
  it("emits typed Inbox launches without resolving a workspace URL", async () => {
    const [emailFirst, inboxFirst] = await Promise.all([
      captureWidget({ interaction: "after" }),
      captureWidget({ interaction: "before" }),
    ]);

    const emailResult = await emailFirst.dataProvider(dashboardReadContext());
    const inboxResult = await inboxFirst.dataProvider(dashboardReadContext());
    expect(emailResult).toEqual(inboxResult);
    const parsed = safeParseRuntimeDashboardWidgetData(emailResult);
    expect(parsed.success).toBeTrue();
    if (!parsed.success) throw new Error("Expected normalized email data");
    const emailData = parsed.data;
    const linkBlock = emailData.view.blocks[1];
    expect(linkBlock?.type).toBe("links");
    if (linkBlock?.type !== "links") throw new Error("Expected Inbox links");
    expect(linkBlock.items[0]).toEqual({
      label: "Open new mail",
      target: {
        kind: "launch",
        launch: { target: "inbox", source: "mail" },
      },
    });
    expect(emailFirst.digestProvider?.(emailData)).toEqual({
      digest: [
        { label: "New mail", value: "4", tone: "warn" },
        { label: "New needs reply", value: "3", tone: "warn" },
      ],
      needsAttention: 2,
    });
  });

  it("keeps launch semantics independent from missing or invalid interactions", async () => {
    const [missing, invalid] = await Promise.all([
      captureWidget({ interaction: "never" }),
      captureWidget({ interaction: "before", href: "https://evil.test" }),
    ]);

    const missingData = await missing.dataProvider(dashboardReadContext());
    const invalidData = await invalid.dataProvider(dashboardReadContext());
    expect(missingData).toEqual(invalidData);
    expect(JSON.stringify(missingData)).not.toContain("evil.test");
    expect(JSON.stringify(missingData)).not.toContain("managementUrl");
  });
});

/** @jsxImportSource preact */
import { describe, expect, it } from "bun:test";
import { DASHBOARD_CHANNELS } from "@brains/contracts";
import type { DashboardWidgetRegistration } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { render } from "preact-render-to-string";
import {
  MailTriageDashboardWidget,
  mailTriageDashboardDataSchema,
  registerEmailTriageDashboardWidget,
  type MailTriageSummary,
} from "../src";

const summary: MailTriageSummary = {
  new: 4,
  high: 2,
  needsReply: 3,
  unclassified: 1,
};

const links = {
  new: "/studio/workspaces/inbox?sourceId=mail-items",
  high: "/studio/workspaces/inbox?sourceId=mail-items&facet.mail-priority=high",
  needsReply:
    "/studio/workspaces/inbox?sourceId=mail-items&facet.needs-reply=true",
  unclassified:
    "/studio/workspaces/inbox?sourceId=mail-items&facet.category=unclassified",
};

function dashboardReadContext(): {
  caller: null;
  signal: AbortSignal;
} {
  return { caller: null, signal: new AbortController().signal };
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
    harness.getServiceContext("email-triage"),
    { summary: async () => summary },
  );
  if (input.interaction === "after") {
    registerInboxInteraction(harness, input.href);
  }
  if (!registration) throw new Error("Email triage widget was not registered");
  return registration;
}

describe("MailTriageDashboardWidget", () => {
  it("links each new-only count to its canonical Inbox source facet", () => {
    const data = mailTriageDashboardDataSchema.parse({ summary, links });
    const html = render(
      <MailTriageDashboardWidget title="Email Triage" data={data} />,
    );

    expect(html).toContain("New mail");
    expect(html).toContain("New high priority");
    expect(html).toContain("New needs reply");
    expect(html).toContain("New unclassified");
    expect(html).toContain(
      'href="/studio/workspaces/inbox?sourceId=mail-items"',
    );
    expect(html).toContain("facet.mail-priority=high");
    expect(html).toContain("facet.needs-reply=true");
    expect(html).toContain("facet.category=unclassified");
    expect(html).toContain("Open new mail");
    expect(html).not.toContain("Open mail desk");
  });

  it("resolves the registered Inbox destination at data-provider time", async () => {
    const [emailFirst, inboxFirst] = await Promise.all([
      captureWidget({ interaction: "after" }),
      captureWidget({ interaction: "before" }),
    ]);

    expect(await emailFirst.dataProvider(dashboardReadContext())).toEqual({
      summary,
      links,
    });
    expect(await inboxFirst.dataProvider(dashboardReadContext())).toEqual({
      summary,
      links,
    });
    expect(emailFirst.digestProvider?.({ summary, links })).toEqual({
      digest: [
        { label: "New mail", value: "4", tone: "warn" },
        { label: "New needs reply", value: "3", tone: "warn" },
      ],
      needsAttention: 2,
    });
  });

  it("omits links instead of guessing or trusting an invalid CMS mount", async () => {
    const [missing, invalid] = await Promise.all([
      captureWidget({ interaction: "never" }),
      captureWidget({ interaction: "before", href: "https://evil.test" }),
    ]);

    expect(await missing.dataProvider(dashboardReadContext())).toEqual({
      summary,
    });
    expect(await invalid.dataProvider(dashboardReadContext())).toEqual({
      summary,
    });
  });
});

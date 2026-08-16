import {
  defineDashboardWidget,
  registerBuiltInDashboardWidget,
  type ServicePluginContext,
} from "@brains/plugins";
import type { MailTriageOperatorService } from "./operator-service";
import { mailTriageDashboardDataSchema } from "./schemas/operator";
import type { MailTriageDashboardData } from "./schemas/operator";

const emailTriageWidget = defineDashboardWidget({
  id: "email-triage",
  title: "Email Triage",
  description: "New restricted derived mail requiring operator attention",
  group: "communication",
  placement: "secondary",
  priority: 30,
  permission: "admin",
  data: mailTriageDashboardDataSchema,
  digest: ({ data }) => ({
    items: [
      {
        label: "New mail",
        value: String(data.summary.new),
        ...(data.summary.new > 0 ? { tone: "warn" } : {}),
      },
      {
        label: "New needs reply",
        value: String(data.summary.needsReply),
        ...(data.summary.needsReply > 0 ? { tone: "warn" } : {}),
      },
    ],
    attention: data.summary.high,
  }),
  view: ({ data }) => ({
    blocks: [
      {
        type: "key-values",
        items: [
          { label: "New mail", value: data.summary.new },
          { label: "New high priority", value: data.summary.high },
          { label: "New needs reply", value: data.summary.needsReply },
          { label: "New unclassified", value: data.summary.unclassified },
        ],
      },
      {
        type: "links",
        items: [
          {
            label: "Open new mail",
            target: {
              launch: { target: "inbox", source: "mail" },
            },
          },
          {
            label: "High priority",
            target: {
              launch: {
                target: "inbox",
                source: "mail",
                filter: "high-priority",
              },
            },
          },
          {
            label: "Needs reply",
            target: {
              launch: {
                target: "inbox",
                source: "mail",
                filter: "needs-reply",
              },
            },
          },
          {
            label: "Unclassified",
            target: {
              launch: {
                target: "inbox",
                source: "mail",
                filter: "unclassified",
              },
            },
          },
        ],
      },
    ],
  }),
});

export async function registerEmailTriageDashboardWidget(
  context: ServicePluginContext,
  operator: Pick<MailTriageOperatorService, "summary">,
): Promise<void> {
  await registerBuiltInDashboardWidget({
    context,
    definition: emailTriageWidget,
    load: async ({ signal }): Promise<MailTriageDashboardData> => {
      signal.throwIfAborted();
      const summary = await operator.summary();
      signal.throwIfAborted();
      return { summary };
    },
  });
}

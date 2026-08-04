/** @jsxImportSource preact */
import {
  KeyValueList,
  WidgetActionLink,
  WidgetActions,
  WidgetEmptyState,
  type WidgetComponentProps,
} from "@brains/dashboard";
import type { ServicePluginContext } from "@brains/plugins";
import type { JSX } from "preact";
import type { MailTriageOperatorService } from "./operator-service";
import { mailTriageDashboardDataSchema } from "./schemas/operator";
import type { MailTriageDashboardData } from "./schemas/operator";

function warningTone(): "warn" {
  return "warn";
}

export function MailTriageDashboardWidget({
  data,
}: WidgetComponentProps): JSX.Element {
  const parsed = mailTriageDashboardDataSchema.safeParse(data);
  if (!parsed.success) {
    return <WidgetEmptyState>Mail status unavailable.</WidgetEmptyState>;
  }
  const { summary, managementUrl } = parsed.data;

  return (
    <div data-mail-triage-widget="true">
      <KeyValueList
        items={[
          { label: "New", value: summary.new },
          { label: "High priority", value: summary.high },
          { label: "Needs reply", value: summary.needsReply },
          { label: "Unclassified", value: summary.unclassified },
        ]}
      />
      {managementUrl && (
        <WidgetActions label="Email triage actions">
          <WidgetActionLink href={managementUrl} emphasis="primary">
            Open mail desk
          </WidgetActionLink>
        </WidgetActions>
      )}
    </div>
  );
}

export async function registerEmailTriageDashboardWidget(
  context: ServicePluginContext,
  operator: MailTriageOperatorService,
  managementUrl?: string,
): Promise<void> {
  await context.dashboard.registerWidget({
    id: "email-triage",
    title: "Email Triage",
    description: "Restricted derived mail requiring operator attention",
    group: "communication",
    section: "secondary",
    priority: 30,
    rendererName: "CustomWidget",
    visibility: "admin",
    component: MailTriageDashboardWidget,
    dataProvider: async (): Promise<MailTriageDashboardData> => {
      const summary = await operator.summary();
      return mailTriageDashboardDataSchema.parse({
        summary,
        ...(managementUrl ? { managementUrl } : {}),
      });
    },
    digestProvider: (data) => {
      const { summary } = mailTriageDashboardDataSchema.parse(data);
      return {
        digest: [
          {
            label: "New mail",
            value: String(summary.new),
            ...(summary.new > 0 ? { tone: warningTone() } : {}),
          },
          {
            label: "Needs reply",
            value: String(summary.needsReply),
            ...(summary.needsReply > 0 ? { tone: warningTone() } : {}),
          },
        ],
        needsAttention: summary.high,
      };
    },
  });
}

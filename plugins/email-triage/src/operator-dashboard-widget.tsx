/** @jsxImportSource preact */
import {
  KeyValueList,
  WidgetActionLink,
  WidgetActions,
  WidgetEmptyState,
  type WidgetComponentProps,
} from "@brains/ui-library";
import type { ServicePluginContext } from "@brains/plugins";
import { setSameOriginSearchParams } from "@brains/plugins/internal/same-origin-path";
import type { JSX } from "preact";
import type { MailTriageOperatorService } from "./operator-service";
import { mailTriageDashboardDataSchema } from "./schemas/operator";
import type {
  MailTriageDashboardData,
  MailTriageDashboardLinks,
} from "./schemas/operator";

const MAIL_INBOX_SOURCE_ID = "mail-items";

function warningTone(): "warn" {
  return "warn";
}

function metricLabel(label: string, href?: string): JSX.Element | string {
  return href ? <a href={href}>{label}</a> : label;
}

function createMailInboxLinks(
  registeredHref: string,
): MailTriageDashboardLinks | undefined {
  const target = (
    facetKey?: string,
    facetValue?: string,
  ): string | undefined => {
    const entries: Array<readonly [string, string]> = [
      ["sourceId", MAIL_INBOX_SOURCE_ID],
    ];
    if (facetKey && facetValue) {
      entries.push([`facet.${facetKey}`, facetValue]);
    }
    return setSameOriginSearchParams(registeredHref, entries, {
      replace: true,
    });
  };
  const newHref = target();
  const high = target("mail-priority", "high");
  const needsReply = target("needs-reply", "true");
  const unclassified = target("category", "unclassified");
  if (!newHref || !high || !needsReply || !unclassified) return undefined;
  return { new: newHref, high, needsReply, unclassified };
}

export function MailTriageDashboardWidget({
  data,
}: WidgetComponentProps): JSX.Element {
  const parsed = mailTriageDashboardDataSchema.safeParse(data);
  if (!parsed.success) {
    return <WidgetEmptyState>Mail status unavailable.</WidgetEmptyState>;
  }
  const { summary, links } = parsed.data;

  return (
    <div data-mail-triage-widget="true">
      <KeyValueList
        items={[
          {
            label: metricLabel("New mail", links?.new),
            value: summary.new,
          },
          {
            label: metricLabel("New high priority", links?.high),
            value: summary.high,
          },
          {
            label: metricLabel("New needs reply", links?.needsReply),
            value: summary.needsReply,
          },
          {
            label: metricLabel("New unclassified", links?.unclassified),
            value: summary.unclassified,
          },
        ]}
      />
      {links && (
        <WidgetActions label="Email triage actions">
          <WidgetActionLink href={links.new} emphasis="primary">
            Open new mail
          </WidgetActionLink>
        </WidgetActions>
      )}
    </div>
  );
}

export async function registerEmailTriageDashboardWidget(
  context: ServicePluginContext,
  operator: Pick<MailTriageOperatorService, "summary">,
): Promise<void> {
  await context.dashboard.registerWidget({
    id: "email-triage",
    title: "Email Triage",
    description: "New restricted derived mail requiring operator attention",
    group: "communication",
    section: "secondary",
    priority: 30,
    rendererName: "CustomWidget",
    visibility: "admin",
    component: MailTriageDashboardWidget,
    dataProvider: async (): Promise<MailTriageDashboardData> => {
      const [summary, appInfo] = await Promise.all([
        operator.summary(),
        context.appInfo(),
      ]);
      const inboxHref = appInfo.interactions.find(
        (interaction) =>
          interaction.id === "unified-inbox" &&
          interaction.kind === "admin" &&
          interaction.visibility === "admin" &&
          interaction.status === "available",
      )?.href;
      const links = inboxHref ? createMailInboxLinks(inboxHref) : undefined;
      return mailTriageDashboardDataSchema.parse({
        summary,
        ...(links ? { links } : {}),
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
            label: "New needs reply",
            value: String(summary.needsReply),
            ...(summary.needsReply > 0 ? { tone: warningTone() } : {}),
          },
        ],
        needsAttention: summary.high,
      };
    },
  });
}

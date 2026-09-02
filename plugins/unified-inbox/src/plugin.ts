import {
  defineServicePlugin,
  z,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import { defineDataSource } from "@brains/sdk/entities";
import { InboxDataSource } from "./inbox-datasource";
import { InboxOperatorService } from "./operator-service";
import { unifiedInboxDigestCheck } from "./digest";
import { inboxListTool } from "./inbox-tool";
import { inboxWidget, loadInboxWidget } from "./dashboard-widget";
import {
  inboxWorkspace,
  inboxWorkspaceHandlers,
  runInboxAction,
} from "./operator-studio";

const unifiedInboxConfigSchema: z.ZodType<
  Record<string, never>,
  Record<string, never>
> = z.strictObject({});

/**
 * The inbox, as one declaration.
 *
 * This package owns no items. Every source registers its own, and what is
 * declared here is the one place they are read together: a list tool, a
 * dashboard widget, a Studio workspace, and a daily digest that says where
 * to go. The digest asks the runtime where the workspace ended up rather
 * than guessing at another package's routes, which is why it can name a
 * page it does not mount.
 */
const unifiedInboxPackage: ServicePackageDefinition<
  typeof unifiedInboxConfigSchema
> = defineServicePlugin({
  id: "unified-inbox",
  config: unifiedInboxConfigSchema,

  setup: ({ inbox, inboxFollowUps }) => {
    const dataSource = new InboxDataSource(inbox);
    return {
      dataSource,
      operator: new InboxOperatorService(inbox, dataSource, inboxFollowUps),
    };
  },

  // The projection, for anything that renders it rather than reads it: the
  // fan-out across sources is the same one the workspace and widget use.
  dataSources: ({ state }) => [
    defineDataSource({
      id: "inbox",
      name: "Unified Inbox DataSource",
      description: "Aggregates live source-owned operator attention",
      fetch: async () => state.dataSource.getInboxData(),
    }),
  ],

  tools: ({ state }) => [inboxListTool(state.operator)],

  checks: ({ state }) => [unifiedInboxDigestCheck(state.dataSource)],

  // Only when Studio mounted the workspace: a way in that leads nowhere is
  // worse than no way in.
  interactions: ({ workspaceUrl }) => {
    const href = workspaceUrl("inbox");
    return href
      ? [
          {
            id: "unified-inbox",
            label: "Inbox",
            description:
              "Review source-owned items that need operator attention.",
            href,
            kind: "admin" as const,
            priority: 20,
            visibility: "admin" as const,
          },
        ]
      : [];
  },

  dashboardWidgets: (context) => [
    inboxWidget.bind(context, loadInboxWidget(context.state.operator)),
  ],

  studioWorkspaces: (context) => {
    const handlers = inboxWorkspaceHandlers(context.state.operator);
    return [
      inboxWorkspace.bind(context, {
        load: handlers.load,
        actions: [runInboxAction.bind(context, handlers.act, handlers.prepare)],
      }),
    ];
  },
});

export default unifiedInboxPackage;

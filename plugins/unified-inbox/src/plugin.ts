import {
  defineServicePlugin,
  z,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import {
  serviceRuntime,
  type ServiceRuntime,
} from "@brains/sdk/internal/service-runtime";
import { normalizeSameOriginPath } from "@brains/plugins";
import { inboxWidget, loadInboxWidget } from "./dashboard-widget";
import { InboxDataSource } from "./inbox-datasource";
import { registerUnifiedInboxDigest } from "./digest";
import { inboxListTool } from "./inbox-tool";
import {
  inboxWorkspace,
  loadInboxWorkspace,
  prepareInboxAction,
  runInboxAction,
  runInboxActionFor,
} from "./operator-studio";
import { InboxOperatorService } from "./operator-service";

const unifiedInboxConfigSchema: z.ZodObject<
  Record<never, never>,
  z.core.$strict
> = z.strictObject({});

/** The projection and the operator every surface reads through, built once. */
interface InboxServices {
  readonly dataSource: InboxDataSource;
  readonly operator: InboxOperatorService;
}

/**
 * The unified inbox: the one place the attention every source registers is
 * read together. It owns no items. A list tool, a Dashboard widget and a
 * Studio workspace read the same live projection, a daily digest points at
 * the workspace, and the Inbox's way in opens it once Studio serves it.
 */
const unifiedInboxPackage: ServicePackageDefinition<
  typeof unifiedInboxConfigSchema
> = defineServicePlugin(
  {
    id: "unified-inbox",
    config: unifiedInboxConfigSchema,
    // One projection for the package, so a page that reads the badge, the
    // workspace and the widget at once fans out to its sources once.
    setup: () => {
      let services: InboxServices | undefined;
      return {
        services: (runtime: ServiceRuntime): InboxServices => {
          if (services) return services;
          const dataSource = new InboxDataSource(runtime.inbox);
          services = {
            dataSource,
            operator: new InboxOperatorService(
              runtime.inbox,
              dataSource,
              runtime.inboxFollowUps,
            ),
          };
          return services;
        },
      };
    },
  },
  {
    subscriptions: (context) => {
      const runtime = serviceRuntime(context);
      const { dataSource } = context.state.services(runtime);
      // In every process, as the class registered it.
      registerUnifiedInboxDigest(runtime, dataSource, {
        workspaceUrl: () => runtime.workspaceUrl(inboxWorkspace),
      });
      // Only when Studio serves the workspace: a way in that leads nowhere
      // is worse than none.
      runtime.ready(() => {
        const href = normalizeSameOriginPath(
          runtime.workspaceUrl(inboxWorkspace),
        );
        if (!href) return;
        runtime.interaction({
          id: "unified-inbox",
          label: "Inbox",
          description:
            "Review source-owned items that need operator attention.",
          href,
          kind: "admin",
          priority: 20,
          visibility: "admin",
        });
      });
      return [];
    },
    tools: (context) => {
      const runtime = serviceRuntime(context);
      return [inboxListTool(context.state.services(runtime).operator, runtime)];
    },
    dashboardWidgets: (context) => {
      const { operator } = context.state.services(serviceRuntime(context));
      return [
        inboxWidget.bind(context, ({ signal }) =>
          loadInboxWidget(operator, signal),
        ),
      ];
    },
    studioWorkspaces: (context) => {
      const { operator } = context.state.services(serviceRuntime(context));
      return [
        inboxWorkspace.bind(context, {
          load: (call) => loadInboxWorkspace(operator, call),
          actions: [
            runInboxAction.bind(
              context,
              (call) => runInboxActionFor(operator, call),
              (call) => prepareInboxAction(operator, call),
            ),
          ],
        }),
      ];
    },
  },
);

export default unifiedInboxPackage;

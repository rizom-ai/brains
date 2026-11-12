import {
  defineServicePlugin,
  z,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import { serviceRuntime } from "@brains/sdk/internal/service-runtime";
import { registerAdministrationWorkspace } from "./administration-workspace";
import {
  invitationsOverviewWidget,
  loadInvitationsOverview,
} from "./invitations-overview";

const adminConfigSchema: z.ZodObject<
  Record<never, never>,
  z.core.$strict
> = z.strictObject({});

export type AdminConfig = z.output<typeof adminConfigSchema>;
export type AdminConfigInput = z.input<typeof adminConfigSchema>;

/**
 * Admin: the headless source owner for the administration workspaces Studio
 * hosts. It composes one Administration workspace from its People,
 * Invitations, Peers and Audit tabs once every plugin has registered, and
 * shows admins the invitations that need attention on the Dashboard, both
 * read from the brain's auth backend.
 */
const adminPackage: ServicePackageDefinition<typeof adminConfigSchema> =
  defineServicePlugin(
    { id: "admin", config: adminConfigSchema },
    {
      subscriptions: (context) => {
        const runtime = serviceRuntime(context);
        // Where the class registered it: once every plugin has registered.
        runtime.registered(async () => {
          await registerAdministrationWorkspace(runtime);
        });
        return [];
      },
      dashboardWidgets: (context) => {
        const runtime = serviceRuntime(context);
        return [
          invitationsOverviewWidget.bind(context, ({ signal }) =>
            loadInvitationsOverview(runtime, signal),
          ),
        ];
      },
    },
  );

export default adminPackage;

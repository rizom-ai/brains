import type { ServicePluginContext, WebRouteDefinition } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import packageJson from "../package.json";
import { registerAdministrationWorkspace } from "./administration-workspace";
import { registerInvitationsOverview } from "./invitations-overview";

const adminConfigSchema: z.ZodObject<
  Record<never, never>,
  z.core.$strict
> = z.strictObject({});

export type AdminConfig = z.output<typeof adminConfigSchema>;
/** Brains pass raw config records; the strict schema rejects any key at parse time. */
export type AdminConfigInput = Record<string, unknown>;

/** Headless source owner for the administration workspaces hosted by Studio. */
export class AdminPlugin extends ServicePlugin<AdminConfig, AdminConfigInput> {
  constructor(config: AdminConfigInput = {}) {
    super("admin", packageJson, config, adminConfigSchema);
  }

  protected override async onRegistrationComplete(
    context: ServicePluginContext,
  ): Promise<void> {
    await registerAdministrationWorkspace(context);
    await registerInvitationsOverview(context);
  }

  override getWebRoutes(): WebRouteDefinition[] {
    return [];
  }
}

export function adminPlugin(config: AdminConfigInput = {}): AdminPlugin {
  return new AdminPlugin(config);
}

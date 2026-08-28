import type { ServicePluginContext, WebRouteDefinition } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import packageJson from "../package.json";
import { registerAdministrationWorkspace } from "./administration-workspace";
import { registerInvitationsOverview } from "./invitations-overview";

export type AdminConfig = Record<string, never>;
export type AdminConfigInput = Record<string, unknown>;

const adminConfigSchema: z.ZodType<AdminConfig, AdminConfigInput> =
  z.strictObject({});

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

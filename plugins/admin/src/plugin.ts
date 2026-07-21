import { getActiveAuthService } from "@brains/auth-service";
import type { ServicePluginContext, WebRouteDefinition } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import packageJson from "../package.json";
import { createAdminRoutes } from "./admin-routes";

export interface AdminConfig {
  routePath: string;
}

export interface AdminConfigInput {
  routePath?: string | undefined;
}

const adminConfigSchema: z.ZodType<AdminConfig, AdminConfigInput> = z.object({
  routePath: z.string().default("/admin"),
});

export class AdminPlugin extends ServicePlugin<AdminConfig, AdminConfigInput> {
  constructor(config: AdminConfigInput = {}) {
    super("admin", packageJson, config, adminConfigSchema);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    context.endpoints.register({
      label: "Admin",
      url: this.config.routePath,
      priority: 50,
      visibility: "admin",
    });
    context.interactions.register({
      id: "admin",
      label: "Admin",
      description:
        "Manage people, access, invitations, external peers, and audit history.",
      href: this.config.routePath,
      kind: "admin",
      priority: 50,
      visibility: "admin",
    });
  }

  override getWebRoutes(): WebRouteDefinition[] {
    return createAdminRoutes({
      routePath: this.config.routePath,
      getContext: () => this.getContext(),
      resolvePrincipal: async (request) =>
        getActiveAuthService()?.resolveSession(request),
    });
  }
}

export function adminPlugin(config: AdminConfigInput = {}): AdminPlugin {
  return new AdminPlugin(config);
}

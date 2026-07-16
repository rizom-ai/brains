import { getActiveAuthService } from "@brains/auth-service";
import type { ServicePluginContext, WebRouteDefinition } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import packageJson from "../package.json";
import { createPeopleRoutes } from "./people-routes";

export interface PeopleConfig {
  routePath: string;
}

export interface PeopleConfigInput {
  routePath?: string | undefined;
}

const peopleConfigSchema: z.ZodType<PeopleConfig, PeopleConfigInput> = z.object(
  {
    routePath: z.string().default("/admin"),
  },
);

export class PeoplePlugin extends ServicePlugin<
  PeopleConfig,
  PeopleConfigInput
> {
  constructor(config: PeopleConfigInput = {}) {
    super("admin", packageJson, config, peopleConfigSchema);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    context.endpoints.register({
      label: "Admin",
      url: this.config.routePath,
      priority: 50,
      visibility: "anchor",
    });
    context.interactions.register({
      id: "admin",
      label: "Admin",
      description:
        "Manage people, access, identity claims, and representation.",
      href: this.config.routePath,
      kind: "admin",
      priority: 50,
      visibility: "anchor",
    });
  }

  override getWebRoutes(): WebRouteDefinition[] {
    return createPeopleRoutes({
      routePath: this.config.routePath,
      getContext: () => this.getContext(),
      resolvePrincipal: async (request) =>
        getActiveAuthService()?.resolveSession(request),
    });
  }
}

export function peoplePlugin(config: PeopleConfigInput = {}): PeoplePlugin {
  return new PeoplePlugin(config);
}

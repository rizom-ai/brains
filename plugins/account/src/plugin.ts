import { getActiveAuthService } from "@brains/auth-service";
import type { ServicePluginContext, WebRouteDefinition } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import packageJson from "../package.json";
import { createAccountRoutes } from "./account-routes";

export interface AccountConfig {
  routePath: string;
}

export interface AccountConfigInput {
  routePath?: string | undefined;
}

const accountConfigSchema: z.ZodType<AccountConfig, AccountConfigInput> =
  z.object({
    routePath: z.string().default("/account"),
  });

export class AccountPlugin extends ServicePlugin<
  AccountConfig,
  AccountConfigInput
> {
  constructor(config: AccountConfigInput = {}) {
    super("account", packageJson, config, accountConfigSchema);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    context.endpoints.register({
      label: "Account",
      url: this.config.routePath,
      priority: 45,
      visibility: "public",
    });
    context.interactions.register({
      id: "account",
      label: "Account",
      description: "Manage your own profile, passkeys, and browser sessions.",
      href: this.config.routePath,
      kind: "human",
      priority: 45,
      visibility: "public",
    });
  }

  override getWebRoutes(): WebRouteDefinition[] {
    return createAccountRoutes({
      routePath: this.config.routePath,
      getContext: () => this.getContext(),
      resolvePrincipal: async (request) =>
        getActiveAuthService()?.resolveSession(request),
    });
  }
}

export function accountPlugin(config: AccountConfigInput = {}): AccountPlugin {
  return new AccountPlugin(config);
}

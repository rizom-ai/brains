import type { ServicePluginContext } from "@brains/plugins";
import { RizomSitePlugin } from "@brains/site-rizom";
import { foundationTemplates } from "./templates";

export class RizomFoundationSitePlugin extends RizomSitePlugin {
  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    context.templates.register(foundationTemplates);
  }
}

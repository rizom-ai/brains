import type { ServicePluginContext } from "@brains/plugins";
import { RizomSitePlugin } from "@brains/site-rizom";
import { workTemplates } from "./templates";

export class RizomWorkSitePlugin extends RizomSitePlugin {
  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    context.templates.register(workTemplates);
  }
}

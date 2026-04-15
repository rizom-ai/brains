import type { ServicePluginContext } from "@brains/plugins";
import { RizomRuntimePlugin } from "@brains/rizom-runtime";
import { templates } from "./templates";

export class RizomSitePlugin extends RizomRuntimePlugin {
  constructor(config: Record<string, unknown> = {}) {
    super("@brains/site-rizom", config);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    context.templates.register(templates);
  }
}

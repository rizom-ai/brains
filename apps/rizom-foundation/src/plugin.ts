import type { ServicePluginContext } from "@brains/plugins";
import { ecosystemTemplate } from "@brains/site-rizom";
import { RizomRuntimePlugin } from "@brains/site-rizom";
import { foundationTemplates } from "./templates";

export class RizomFoundationSitePlugin extends RizomRuntimePlugin {
  constructor(config: Record<string, unknown> = {}) {
    super("rizom-foundation-site", config);
  }

  protected override getVariant() {
    return "foundation" as const;
  }

  protected override getCanvasPath(): string {
    return "/canvases/roots.canvas.js";
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    context.templates.register({ ecosystem: ecosystemTemplate });
    context.templates.register(foundationTemplates);
  }
}

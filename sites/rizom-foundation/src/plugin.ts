import type { ServicePluginContext } from "@brains/plugins";
import { ecosystemTemplate } from "@brains/rizom-ecosystem";
import { RizomRuntimePlugin } from "@brains/rizom-runtime";
import { foundationTemplates } from "./templates";

export class RizomFoundationSitePlugin extends RizomRuntimePlugin {
  constructor(config: Record<string, unknown> = {}) {
    super("@brains/site-rizom-foundation", config);
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

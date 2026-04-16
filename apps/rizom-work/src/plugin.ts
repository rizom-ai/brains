import type { ServicePluginContext } from "@brains/plugins";
import { ecosystemTemplate } from "@brains/site-rizom";
import { RizomRuntimePlugin } from "@brains/site-rizom";
import { workTemplates } from "./templates";

export class RizomWorkSitePlugin extends RizomRuntimePlugin {
  constructor(config: Record<string, unknown> = {}) {
    super("rizom-work-site", config);
  }

  protected override getVariant() {
    return "work" as const;
  }

  protected override getCanvasPath(): string {
    return "/canvases/constellation.canvas.js";
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    context.templates.register({ ecosystem: ecosystemTemplate });
    context.templates.register(workTemplates);
  }
}

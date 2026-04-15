import type { ServicePluginContext } from "@brains/plugins";
import { ecosystemTemplate } from "@brains/rizom-ecosystem";
import { RizomRuntimePlugin } from "@brains/rizom-runtime";
import { workTemplates } from "./templates";

export class RizomWorkSitePlugin extends RizomRuntimePlugin {
  constructor(config: Record<string, unknown> = {}) {
    super("@brains/site-rizom-work", config);
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

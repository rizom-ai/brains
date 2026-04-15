import type { ServicePluginContext } from "@brains/plugins";
import { RizomSitePlugin } from "@brains/site-rizom";
import { aiTemplates } from "./templates";

export class RizomAiSitePlugin extends RizomSitePlugin {
  protected override getVariant() {
    return "ai" as const;
  }

  protected override getCanvasPath(): string {
    return "/canvases/tree.canvas.js";
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    context.templates.register(aiTemplates);
  }
}

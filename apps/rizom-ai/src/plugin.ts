import type { ServicePluginContext } from "@brains/plugins";
import { ecosystemTemplate } from "@brains/site-rizom";
import { RizomRuntimePlugin } from "@brains/site-rizom";
import { aiTemplates } from "./templates";

export class RizomAiSitePlugin extends RizomRuntimePlugin {
  constructor(config: Record<string, unknown> = {}) {
    super("rizom-ai-site", config);
  }

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
    context.templates.register({ ecosystem: ecosystemTemplate });
    context.templates.register(aiTemplates);
  }
}

import type { Tool, Resource, ServicePluginContext } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils";
import canvasPrelude from "./canvases/prelude.canvas.js" with { type: "text" };
import treeCanvas from "./canvases/tree.canvas.js" with { type: "text" };
import constellationCanvas from "./canvases/constellation.canvas.js" with { type: "text" };
import rootsCanvas from "./canvases/roots.canvas.js" with { type: "text" };
import bootScript from "./boot/boot.boot.js" with { type: "text" };

export const rizomRuntimeConfigSchema = z.object({
  variant: z.enum(["ai", "foundation", "work"]).optional(),
  theme: z.string().optional(),
});

export type RizomRuntimeConfig = z.infer<typeof rizomRuntimeConfigSchema>;
export type RizomRuntimeVariant = NonNullable<RizomRuntimeConfig["variant"]>;

const CANVAS_BY_VARIANT: Record<RizomRuntimeVariant, string> = {
  ai: "/canvases/tree.canvas.js",
  foundation: "/canvases/roots.canvas.js",
  work: "/canvases/constellation.canvas.js",
};

export const rizomRuntimeStaticAssets: Record<string, string> = {
  "/canvases/prelude.canvas.js": canvasPrelude,
  "/canvases/tree.canvas.js": treeCanvas,
  "/canvases/constellation.canvas.js": constellationCanvas,
  "/canvases/roots.canvas.js": rootsCanvas,
  "/boot.js": bootScript,
};

export class RizomRuntimePlugin extends ServicePlugin<RizomRuntimeConfig> {
  constructor(packageName: string, config: Record<string, unknown> = {}) {
    super(
      "rizom-site",
      { name: packageName, version: "0.1.0" },
      config,
      rizomRuntimeConfigSchema,
    );
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    const variant = this.getVariant();
    const canvasPath = this.getCanvasPath(variant);

    context.messaging.subscribe("system:plugins:ready", async () => {
      await context.messaging.send("plugin:site-builder:head-script:register", {
        pluginId: this.id,
        script: this.buildHeadScript(variant, canvasPath),
      });
      return { success: true };
    });

    this.logger.info(
      `Rizom runtime plugin registered${variant ? ` (variant: ${variant})` : ""}`,
    );
  }

  protected getVariant(): RizomRuntimeVariant | undefined {
    return this.config.variant;
  }

  protected getCanvasPath(variant?: RizomRuntimeVariant): string | undefined {
    return variant ? CANVAS_BY_VARIANT[variant] : undefined;
  }

  protected buildHeadScript(variant?: string, canvasPath?: string): string {
    const scripts = [`<script src="/boot.js" defer></script>`];

    if (variant) {
      const variantJson = JSON.stringify(variant);
      scripts.unshift(
        `<script>window.__RIZOM_VARIANT__=${variantJson};</script>`,
      );
    }

    if (canvasPath) {
      scripts.push(`<script src="/canvases/prelude.canvas.js" defer></script>`);
      scripts.push(`<script src="${canvasPath}" defer></script>`);
    }

    return scripts.join("");
  }

  protected override async getTools(): Promise<Tool[]> {
    return [];
  }

  protected override async getResources(): Promise<Resource[]> {
    return [];
  }
}

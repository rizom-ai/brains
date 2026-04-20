import type { Tool, Resource, ServicePluginContext } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils";
import canvasPrelude from "./canvases/prelude.canvas.js" with { type: "text" };
import treeCanvas from "./canvases/tree.canvas.js" with { type: "text" };
import constellationCanvas from "./canvases/constellation.canvas.js" with { type: "text" };
import rootsCanvas from "./canvases/roots.canvas.js" with { type: "text" };
import bootScript from "./boot/boot.boot.js" with { type: "text" };

export const rizomThemeProfileSchema = z.enum([
  "product",
  "editorial",
  "studio",
]);

export const rizomRuntimeConfigSchema = z.object({
  themeProfile: rizomThemeProfileSchema.optional(),
  theme: z.string().optional(),
});

export type RizomRuntimeConfig = z.infer<typeof rizomRuntimeConfigSchema>;
export type RizomThemeProfile = NonNullable<RizomRuntimeConfig["themeProfile"]>;

const CANVAS_BY_THEME_PROFILE: Record<RizomThemeProfile, string> = {
  product: "/canvases/tree.canvas.js",
  editorial: "/canvases/roots.canvas.js",
  studio: "/canvases/constellation.canvas.js",
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
    const themeProfile = this.getThemeProfile();
    const canvasPath = this.getCanvasPath(themeProfile);

    context.messaging.subscribe("system:plugins:ready", async () => {
      await context.messaging.send("plugin:site-builder:head-script:register", {
        pluginId: this.id,
        script: this.buildHeadScript(themeProfile, canvasPath),
      });
      return { success: true };
    });

    this.logger.info(
      `Rizom runtime plugin registered${themeProfile ? ` (theme profile: ${themeProfile})` : ""}`,
    );
  }

  protected getThemeProfile(): RizomThemeProfile | undefined {
    return this.config.themeProfile;
  }

  protected getCanvasPath(
    themeProfile?: RizomThemeProfile,
  ): string | undefined {
    return themeProfile ? CANVAS_BY_THEME_PROFILE[themeProfile] : undefined;
  }

  protected buildHeadScript(
    themeProfile?: string,
    canvasPath?: string,
  ): string {
    const scripts = [`<script src="/boot.js" defer></script>`];

    if (themeProfile) {
      const themeProfileJson = JSON.stringify(themeProfile);
      scripts.unshift(
        `<script>window.__RIZOM_THEME_PROFILE__=${themeProfileJson};</script>`,
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

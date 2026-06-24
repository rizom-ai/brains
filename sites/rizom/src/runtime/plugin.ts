import type { Tool, Resource, ServicePluginContext } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { listCanonicalAtprotoLexicons } from "@brains/atproto-contracts";
import { z } from "@brains/utils/zod";
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

export type RizomRuntimeConfig = z.output<typeof rizomRuntimeConfigSchema>;
export type RizomRuntimeConfigInput = z.input<typeof rizomRuntimeConfigSchema>;
export type RizomThemeProfile = NonNullable<RizomRuntimeConfig["themeProfile"]>;

const CANVAS_BY_THEME_PROFILE: Record<RizomThemeProfile, string> = {
  product: "/canvases/tree.canvas.js",
  editorial: "/canvases/roots.canvas.js",
  studio: "/canvases/constellation.canvas.js",
};

export const RIZOM_ATPROTO_LEXICON_BASE_PATH = "/atproto/lexicons";

function formatLexiconJson(lexicon: unknown): string {
  return `${JSON.stringify(lexicon, null, 2)}\n`;
}

export const rizomAtprotoLexiconStaticAssets: Record<string, string> =
  Object.fromEntries(
    listCanonicalAtprotoLexicons().map((lexicon) => [
      `${RIZOM_ATPROTO_LEXICON_BASE_PATH}/${lexicon.id}.json`,
      formatLexiconJson(lexicon),
    ]),
  );

export const rizomRuntimeStaticAssets: Record<string, string> = {
  ...rizomAtprotoLexiconStaticAssets,
  "/canvases/prelude.canvas.js": canvasPrelude,
  "/canvases/tree.canvas.js": treeCanvas,
  "/canvases/constellation.canvas.js": constellationCanvas,
  "/canvases/roots.canvas.js": rootsCanvas,
  "/boot.js": bootScript,
};

export class RizomRuntimePlugin extends ServicePlugin<
  RizomRuntimeConfig,
  RizomRuntimeConfigInput
> {
  constructor(packageName: string, config: RizomRuntimeConfigInput = {}) {
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
      await context.messaging.send({
        type: "plugin:site-builder:head-script:register",
        payload: {
          pluginId: this.id,
          script: this.buildHeadScript(themeProfile, canvasPath),
        },
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
        `<script>document.documentElement.setAttribute("data-theme-profile", ${themeProfileJson});</script>`,
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

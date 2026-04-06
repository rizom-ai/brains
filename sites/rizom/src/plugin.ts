import type { Tool, Resource, ServicePluginContext } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils";
import { templates } from "./templates";

/**
 * Config for the Rizom site plugin.
 *
 * A single package (`@brains/site-rizom`) serves all three rizom
 * variants (ai / foundation / work). Each brain instance selects its
 * variant via `site.variant` in brain.yaml, which the resolver spreads
 * through to this plugin's factory.
 */
const rizomSiteConfigSchema = z.object({
  variant: z.enum(["ai", "foundation", "work"]).default("ai"),
  /** Optional theme override (e.g. `github:org/theme-repo`) — reserved for future use. */
  theme: z.string().optional(),
});

type RizomSiteConfig = z.infer<typeof rizomSiteConfigSchema>;

/**
 * Maps each variant to the static-asset path of its canvas script.
 * The canvas files are shipped by the site package's `staticAssets`
 * map (see `src/index.ts`), so the browser fetches them from the
 * build output rather than receiving them inline.
 */
const CANVAS_BY_VARIANT: Record<RizomSiteConfig["variant"], string> = {
  ai: "/canvases/tree.canvas.js",
  foundation: "/canvases/roots.canvas.js",
  work: "/canvases/constellation.canvas.js",
};

export class RizomSitePlugin extends ServicePlugin<RizomSiteConfig> {
  constructor(config: Record<string, unknown> = {}) {
    super(
      "rizom-site",
      { name: "@brains/site-rizom", version: "0.1.0" },
      config,
      rizomSiteConfigSchema,
    );
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    context.templates.register(templates);

    const variant = this.config.variant;
    const canvasPath = CANVAS_BY_VARIANT[variant];

    // Wait for site-builder's head-script handler to be subscribed
    // before sending the registration message. Same pattern as
    // plugins/analytics uses for the Cloudflare beacon script.
    context.messaging.subscribe("system:plugins:ready", async () => {
      await context.messaging.send("plugin:site-builder:head-script:register", {
        pluginId: this.id,
        script: this.buildHeadScript(variant, canvasPath),
      });
      return { success: true };
    });

    this.logger.info(`Rizom site plugin registered (variant: ${variant})`);
  }

  /**
   * Build the head script content.
   *
   *   - Sets `data-rizom-variant` on `<body>` as soon as the body
   *     element exists, so the theme's variant selectors apply.
   *   - Loads the canvas script with `defer` so it runs after
   *     the document is parsed and the `#heroCanvas` element exists.
   */
  private buildHeadScript(variant: string, canvasPath: string): string {
    return [
      `<script>`,
      `(function(){`,
      `var apply=function(){document.body&&document.body.setAttribute('data-rizom-variant',${JSON.stringify(
        variant,
      )});};`,
      `if(document.body){apply();}else{document.addEventListener('DOMContentLoaded',apply);}`,
      `})();`,
      `</script>`,
      `<script src="${canvasPath}" defer></script>`,
    ].join("");
  }

  protected override async getTools(): Promise<Tool[]> {
    return [];
  }

  protected override async getResources(): Promise<Resource[]> {
    return [];
  }
}

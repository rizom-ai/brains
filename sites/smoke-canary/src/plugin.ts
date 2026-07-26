import type {
  Plugin,
  Resource,
  ServicePluginContext,
  Tool,
} from "@rizom/brain/plugins";
import { ServicePlugin } from "@rizom/brain/plugins";
import { createTemplate } from "@rizom/brain/templates";
import { z } from "@rizom/brain";
import { CanaryHomeLayout, type CanaryHomeData } from "./templates/canary-home";
import packageJson from "../package.json";

type CanarySiteConfig = Record<string, never>;

const configSchema: z.ZodType<CanarySiteConfig, CanarySiteConfig> = z.object(
  {},
);

/**
 * Minimal site plugin for the hosted-package canary. Registers a single static
 * homepage template with no datasource, so the site renders deterministically
 * without any brain content (profile, posts, site-info).
 */
export class SmokeCanarySitePlugin extends ServicePlugin<
  CanarySiteConfig,
  CanarySiteConfig
> {
  constructor(config: CanarySiteConfig = {}) {
    super("smoke-canary-site", packageJson, config, configSchema);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    const emptySchema = z.object({});

    context.templates.register({
      home: createTemplate<z.infer<typeof emptySchema>, CanaryHomeData>({
        name: "home",
        description: "Deterministic smoke-canary homepage",
        schema: emptySchema,
        requiredPermission: "public",
        layout: {
          component: CanaryHomeLayout,
        },
      }),
    });
  }

  protected override async getTools(): Promise<Tool[]> {
    return [];
  }

  protected override async getResources(): Promise<Resource[]> {
    return [];
  }
}

export function smokeCanarySitePlugin(
  config: Record<string, never> = {},
): Plugin {
  return new SmokeCanarySitePlugin(config);
}

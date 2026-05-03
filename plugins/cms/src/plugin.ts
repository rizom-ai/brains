import type { ServicePluginContext, WebRouteDefinition } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import {
  generateCmsConfig,
  type CmsConfig,
  type EntityDisplayMap,
} from "@brains/cms-config";
import { renderCmsShellHtml } from "./cms-shell";
import { toYaml, z } from "@brains/utils";
import packageJson from "../package.json";

const entityDisplayEntrySchema = z
  .object({
    label: z.string().optional(),
    pluralName: z.string().optional(),
  })
  .passthrough();

const cmsPluginConfigSchema = z.object({
  entityDisplay: z.record(entityDisplayEntrySchema).optional(),
  routePath: z.string().default("/cms"),
});

type CmsPluginConfig = z.infer<typeof cmsPluginConfigSchema>;

function getCmsConfigPath(routePath: string): string {
  return `${routePath.endsWith("/") ? routePath : `${routePath}/`}config.yml`;
}

function getCmsConfigOptions(
  config: CmsPluginConfig,
  context?: ServicePluginContext,
): {
  entityDisplay?: EntityDisplayMap;
} {
  const entityDisplay =
    (config.entityDisplay as EntityDisplayMap | undefined) ??
    (context?.entityDisplay as EntityDisplayMap | undefined);
  return entityDisplay ? { entityDisplay } : {};
}

async function getRepoInfo(
  context: ServicePluginContext,
): Promise<{ repo: string; branch: string }> {
  const repoInfo = await context.messaging.send<
    Record<string, never>,
    { repo: string; branch: string }
  >({ type: "git-sync:get-repo-info", payload: {} });

  if ("noop" in repoInfo || !repoInfo.success || !repoInfo.data) {
    throw new Error("CMS config unavailable: git-sync repo info unavailable");
  }

  const { repo, branch } = repoInfo.data;
  if (!repo || !branch) {
    throw new Error("CMS config unavailable: git-sync repo info incomplete");
  }

  return { repo, branch };
}

async function buildCmsConfig(
  context: ServicePluginContext,
  options: { entityDisplay?: EntityDisplayMap } = {},
): Promise<CmsConfig> {
  const { repo, branch } = await getRepoInfo(context);
  return generateCmsConfig({
    repo,
    branch,
    ...(context.siteUrl && { baseUrl: context.siteUrl }),
    entityTypes: context.entityService.getEntityTypes(),
    getFrontmatterSchema: (type) =>
      context.entities.getEffectiveFrontmatterSchema(type),
    getAdapter: (type) => context.entities.getAdapter(type),
    ...(options.entityDisplay && { entityDisplay: options.entityDisplay }),
  });
}

export async function buildCmsConfigYaml(
  context: ServicePluginContext,
  options: { entityDisplay?: EntityDisplayMap } = {},
): Promise<string> {
  return toYaml(await buildCmsConfig(context, options));
}

export class CmsPlugin extends ServicePlugin<CmsPluginConfig> {
  constructor(config: Partial<CmsPluginConfig> = {}) {
    super("cms", packageJson, config, cmsPluginConfigSchema);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    context.endpoints.register({
      label: "CMS",
      url: this.config.routePath,
      priority: 40,
    });
  }

  override getWebRoutes(): WebRouteDefinition[] {
    const cmsConfigPath = getCmsConfigPath(this.config.routePath);

    return [
      {
        path: this.config.routePath,
        method: "GET",
        public: true,
        handler: async (): Promise<Response> => {
          return new Response(renderCmsShellHtml({ cmsConfigPath }), {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        },
      },
      {
        path: cmsConfigPath,
        method: "GET",
        public: true,
        handler: async (): Promise<Response> => {
          try {
            const yaml = await buildCmsConfigYaml(
              this.getContext(),
              getCmsConfigOptions(this.config, this.getContext()),
            );
            return new Response(yaml, {
              headers: { "Content-Type": "application/yaml; charset=utf-8" },
            });
          } catch (error) {
            return new Response(
              error instanceof Error ? error.message : "CMS unavailable",
              {
                status: 503,
                headers: { "Content-Type": "text/plain; charset=utf-8" },
              },
            );
          }
        },
      },
    ];
  }
}

export function cmsPlugin(config?: Partial<CmsPluginConfig>): CmsPlugin {
  return new CmsPlugin(config);
}

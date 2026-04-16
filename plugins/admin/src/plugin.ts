import type { ServicePluginContext, WebRouteDefinition } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { generateCmsConfig, type EntityDisplayMap } from "@brains/cms-config";
import { renderCmsShellHtml } from "./admin-shell";
import { toYaml, z } from "@brains/utils";
import packageJson from "../package.json";

const entityDisplayEntrySchema = z
  .object({
    label: z.string().optional(),
    pluralName: z.string().optional(),
  })
  .passthrough();

const adminConfigSchema = z.object({
  entityDisplay: z.record(entityDisplayEntrySchema).optional(),
  routePath: z.string().default("/"),
});

type AdminConfig = z.infer<typeof adminConfigSchema>;

function getCmsConfigOptions(config: AdminConfig): {
  entityDisplay?: EntityDisplayMap;
} {
  const entityDisplay = config.entityDisplay as EntityDisplayMap | undefined;
  return entityDisplay ? { entityDisplay } : {};
}

async function getRepoInfo(
  context: ServicePluginContext,
): Promise<{ repo: string; branch: string }> {
  const repoInfo = await context.messaging.send<
    Record<string, never>,
    { repo: string; branch: string }
  >("git-sync:get-repo-info", {});

  if ("noop" in repoInfo || !repoInfo.success || !repoInfo.data) {
    throw new Error("CMS config unavailable: git-sync repo info unavailable");
  }

  const { repo, branch } = repoInfo.data;
  if (!repo || !branch) {
    throw new Error("CMS config unavailable: git-sync repo info incomplete");
  }

  return { repo, branch };
}

export async function buildCmsConfigYaml(
  context: ServicePluginContext,
  options: { entityDisplay?: EntityDisplayMap } = {},
): Promise<string> {
  const { repo, branch } = await getRepoInfo(context);
  const cmsConfig = generateCmsConfig({
    repo,
    branch,
    ...(context.siteUrl && { baseUrl: context.siteUrl }),
    entityTypes: context.entityService.getEntityTypes(),
    getFrontmatterSchema: (type) =>
      context.entities.getEffectiveFrontmatterSchema(type),
    getAdapter: (type) => context.entities.getAdapter(type),
    ...(options.entityDisplay && { entityDisplay: options.entityDisplay }),
  });

  return toYaml(cmsConfig);
}

export class AdminPlugin extends ServicePlugin<AdminConfig> {
  constructor(config: Partial<AdminConfig> = {}) {
    super("admin", packageJson, config, adminConfigSchema);
  }

  override getWebRoutes(): WebRouteDefinition[] {
    return [
      {
        path: this.config.routePath,
        method: "GET",
        public: true,
        handler: async (): Promise<Response> => {
          try {
            const yaml = await buildCmsConfigYaml(
              this.getContext(),
              getCmsConfigOptions(this.config),
            );
            return new Response(renderCmsShellHtml({ cmsConfigYaml: yaml }), {
              headers: { "Content-Type": "text/html; charset=utf-8" },
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

export function adminPlugin(config?: Partial<AdminConfig>): AdminPlugin {
  return new AdminPlugin(config);
}

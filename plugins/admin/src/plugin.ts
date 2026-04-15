import type { Resource, ServicePluginContext } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { generateCmsConfig, type EntityDisplayMap } from "@brains/cms-config";
import { toYaml, z } from "@brains/utils";
import packageJson from "../package.json";

export const CMS_CONFIG_URI = "brain://cms-config";
const CMS_CONFIG_TOPIC = "system:cms-config:get";

const entityDisplayEntrySchema = z
  .object({
    label: z.string().optional(),
    pluralName: z.string().optional(),
  })
  .passthrough();

const adminConfigSchema = z.object({
  entityDisplay: z.record(entityDisplayEntrySchema).optional(),
});

type AdminConfig = z.infer<typeof adminConfigSchema>;

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

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    context.messaging.subscribe(CMS_CONFIG_TOPIC, async () => {
      try {
        return {
          success: true,
          data: await buildCmsConfigYaml(context, {
            ...(this.config.entityDisplay && {
              entityDisplay: this.config.entityDisplay as EntityDisplayMap,
            }),
          }),
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to build CMS config",
        };
      }
    });
  }

  protected override async getResources(): Promise<Resource[]> {
    return [
      {
        uri: CMS_CONFIG_URI,
        name: "CMS Config",
        description: "Schema-driven Sveltia CMS config for the current brain",
        mimeType: "text/yaml",
        handler: async () => ({
          contents: [
            {
              uri: CMS_CONFIG_URI,
              mimeType: "text/yaml",
              text: await buildCmsConfigYaml(this.getContext(), {
                ...(this.config.entityDisplay && {
                  entityDisplay: this.config.entityDisplay as EntityDisplayMap,
                }),
              }),
            },
          ],
        }),
      },
    ];
  }
}

export function adminPlugin(config?: Partial<AdminConfig>): AdminPlugin {
  return new AdminPlugin(config);
}

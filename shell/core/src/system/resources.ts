import { generateCmsConfig } from "@brains/cms-config";
import type { Resource } from "@brains/mcp-service";
import { toYaml } from "@brains/utils";
import type { SystemServices } from "./types";

const CMS_CONFIG_URI = "brain://cms-config";

async function getCmsConfigYaml(services: SystemServices): Promise<string> {
  const repoInfo = await services.messageBus.send<
    Record<string, never>,
    { repo: string; branch: string }
  >("git-sync:get-repo-info", {}, "system");

  if ("noop" in repoInfo || !repoInfo.success || !repoInfo.data) {
    throw new Error("CMS config unavailable: git-sync repo info unavailable");
  }

  const { repo, branch } = repoInfo.data;
  if (!repo || !branch) {
    throw new Error("CMS config unavailable: git-sync repo info incomplete");
  }

  const cmsConfig = generateCmsConfig({
    repo,
    branch,
    ...(services.siteBaseUrl && {
      baseUrl: `https://${services.siteBaseUrl}`,
    }),
    entityTypes: services.entityService.getEntityTypes(),
    getFrontmatterSchema: (type) =>
      services.entityRegistry.getEffectiveFrontmatterSchema(type),
    getAdapter: (type) => services.entityRegistry.getAdapter(type),
    ...(services.entityDisplay && {
      entityDisplay: services.entityDisplay,
    }),
  });

  return toYaml(cmsConfig);
}

export function createSystemResources(services: SystemServices): Resource[] {
  return [
    {
      uri: "entity://types",
      name: "Entity Types",
      description: "List of registered entity types",
      mimeType: "text/plain",
      handler: async () => ({
        contents: [
          {
            uri: "entity://types",
            mimeType: "text/plain",
            text: services.entityService.getEntityTypes().join("\n"),
          },
        ],
      }),
    },
    {
      uri: "brain://identity",
      name: "Brain Identity",
      description: "Brain character — name, role, purpose, values",
      mimeType: "application/json",
      handler: async () => ({
        contents: [
          {
            uri: "brain://identity",
            mimeType: "application/json",
            text: JSON.stringify(services.getIdentity(), null, 2),
          },
        ],
      }),
    },
    {
      uri: "brain://profile",
      name: "Anchor Profile",
      description: "Brain owner profile — name, bio, expertise",
      mimeType: "application/json",
      handler: async () => ({
        contents: [
          {
            uri: "brain://profile",
            mimeType: "application/json",
            text: JSON.stringify(services.getProfile(), null, 2),
          },
        ],
      }),
    },
    {
      uri: "brain://status",
      name: "Brain Status",
      description: "System status — version, model, interfaces, tools",
      mimeType: "application/json",
      handler: async () => ({
        contents: [
          {
            uri: "brain://status",
            mimeType: "application/json",
            text: JSON.stringify(await services.getAppInfo(), null, 2),
          },
        ],
      }),
    },
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
            text: await getCmsConfigYaml(services),
          },
        ],
      }),
    },
  ];
}

import { defineDataSource } from "@brains/sdk/entities";
import {
  defineServicePlugin,
  z,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import {
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import { fetchAnchorProfileData } from "@brains/profile";
import { contactFormDiscoveryRequest } from "@brains/contracts";
import {
  homepageChatAvailable,
  homepageOpeningSchema,
  loadHomepageOpening,
} from "@brains/site-atlas";
import {
  organizationSiteConfigSchema,
  type OrganizationSiteConfigInput,
} from "./config";
import { organizationHomepageData } from "./datasources/homepage-datasource";
import { loadAgentRadar } from "./datasources/agent-radar";
import { organizationProfileSchema } from "./schemas/organization-profile";
import { organizationHomepageSchema } from "./schemas/homepage";
import { OrganizationAbout } from "./templates/about";
import { OrganizationHomepage } from "./templates/homepage";
import packageJson from "../package.json";

export const organizationSiteDefinition: ServicePackageDefinition<
  typeof organizationSiteConfigSchema
> = defineServicePlugin(
  {
    id: "organization-site",
    config: organizationSiteConfigSchema,
    dependsOn: ["@brains/agent-discovery:agents"],
    setup: ({
      messaging,
      interfaceAvailability,
      siteUrl,
      previewUrl,
      localSiteUrl,
      preferLocalUrls,
    }) => ({
      interfaceAvailability,
      siteUrl,
      previewUrl,
      localSiteUrl,
      preferLocalUrls,
      // Bridge the atlas's bounded discovery envelope, not a route registry.
      messaging: {
        send: async (): Promise<unknown> => {
          const response = await messaging.request(
            contactFormDiscoveryRequest,
            {},
          );
          return response.ok
            ? { success: true, data: response.data }
            : { success: false };
        },
      },
    }),
  },
  {
    dataSources: ({ state }) => [
      defineDataSource({
        id: "homepage",
        name: "Organization Homepage",
        description: "Scoped profile, opening and agent radar",
        fetch: async (_query, entities, context) => {
          const [profile, map, authored, askBox] = await Promise.all([
            fetchAnchorProfileData(entities, organizationProfileSchema),
            loadAgentRadar({
              entityService: entities,
              semantic: { project: (request) => entities.project(request) },
            }),
            loadHomepageOpening({ ...context, entityService: entities }, state),
            homepageChatAvailable(context, state),
          ]);
          return organizationHomepageData({
            profile,
            map,
            authored: homepageOpeningSchema.parse(authored),
            askBox,
          });
        },
      }),
      defineDataSource({
        id: "about",
        name: "Organization About",
        description: "Scoped organization profile",
        fetch: async (_query, entities) => ({
          profile: await fetchAnchorProfileData(
            entities,
            organizationProfileSchema,
          ),
        }),
      }),
    ],
    templates: {
      homepage: {
        schema: organizationHomepageSchema,
        permission: "public",
        dataSourceId: "@brains/site-organization:homepage",
        render: OrganizationHomepage,
        description: "Organization opening and agent radar",
      },
      about: {
        schema: z.object({ profile: organizationProfileSchema }),
        permission: "public",
        dataSourceId: "@brains/site-organization:about",
        render: OrganizationAbout,
        description: "About the organization",
      },
    },
  },
);

/** Internal conventional-site adapter; all behavior is declared above. */
export function createOrganizationRuntime(
  config: OrganizationSiteConfigInput = {},
): Plugin {
  const [plugin] = instantiatePluginPackageDefinition(
    organizationSiteDefinition,
    config,
    packageJson,
  );
  if (!plugin)
    throw new Error("Organization site declaration produced no runtime");
  return plugin;
}

import {
  HOMEPAGE_ATLAS_SCRIPT,
  HOMEPAGE_ATLAS_SCRIPT_PATH,
} from "@brains/site-atlas";
import type { SiteRuntimeDeclaration } from "@brains/sdk/internal/site-runtime";
import { createTemplate } from "@brains/templates";
import { z } from "@brains/utils/zod";
import { organizationSiteConfigSchema } from "./config";
import { aboutDataSource } from "./datasources/about-datasource";
import { homepageDataSource } from "./datasources/homepage-datasource";
import { organizationProfileSchema } from "./schemas/organization-profile";
import {
  OrganizationAbout,
  type OrganizationAboutData,
} from "./templates/about";
import {
  organizationHomepageSchema,
  type OrganizationHomepageData,
} from "./schemas/homepage";
import { OrganizationHomepage } from "./templates/homepage";

/**
 * What the organization site registers for the brain: the radar homepage
 * and the about page, each drawn from its own data source.
 */
export const organizationSiteRuntime: SiteRuntimeDeclaration<
  typeof organizationSiteConfigSchema
> = {
  id: "organization-site",
  config: organizationSiteConfigSchema,
  templates: {
    homepage: createTemplate<OrganizationHomepageData>({
      name: "homepage",
      description:
        "Organization homepage: the opening over the radar of the agent network",
      schema: organizationHomepageSchema,
      dataSourceId: "organization-site:homepage",
      requiredPermission: "public",
      // Touch title cards, the door's theme and motion pausing for the frame.
      runtimeScripts: [{ src: HOMEPAGE_ATLAS_SCRIPT_PATH, defer: true }],
      staticAssets: { [HOMEPAGE_ATLAS_SCRIPT_PATH]: HOMEPAGE_ATLAS_SCRIPT },
      layout: { component: OrganizationHomepage },
    }),
    about: createTemplate<OrganizationAboutData>({
      name: "about",
      description:
        "About page: the team or organization from its anchor profile",
      schema: z.object({ profile: organizationProfileSchema }),
      dataSourceId: "organization-site:about",
      requiredPermission: "public",
      layout: { component: OrganizationAbout },
    }),
  },
  dataSources: () => [homepageDataSource, aboutDataSource],
};

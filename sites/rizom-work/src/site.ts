/// <reference types="./types.d.ts" />

import {
  createSiteContentTemplates,
  type SiteContentDefinition,
} from "@brains/site-content";
import { createRizomSite } from "@brains/site-rizom";
import type { RouteDefinitionInput } from "@brains/site-composition";
import { WorkLayout } from "./layout";
import { workRoutes } from "./routes";
import workSiteContent from "./site-content";
import themeOverride from "./theme.css" with { type: "text" };

const typedRoutes = workRoutes as unknown as RouteDefinitionInput[];
const typedSiteContent = workSiteContent as unknown as SiteContentDefinition;

export const rizomWorkSite = createRizomSite({
  packageName: "@brains/site-rizom-work",
  contentNamespace: typedSiteContent.namespace,
  themeProfile: "studio",
  layout: WorkLayout,
  routes: typedRoutes,
  templates: createSiteContentTemplates(typedSiteContent),
  themeOverride,
});

export default rizomWorkSite;

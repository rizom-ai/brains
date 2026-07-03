/// <reference types="./types.d.ts" />

import {
  createRizomSite,
  createSiteContentTemplates,
} from "@brains/site-rizom";
import { WorkLayout } from "./layout";
import { workRoutes } from "./routes";
import workSiteContent from "./site-content";
import themeOverride from "./theme.css" with { type: "text" };

export const rizomWorkSite = createRizomSite({
  packageName: "@brains/site-rizom-work",
  contentNamespace: workSiteContent.namespace,
  themeProfile: "studio",
  layout: WorkLayout,
  routes: workRoutes,
  templates: createSiteContentTemplates(workSiteContent),
  themeOverride,
});

export default rizomWorkSite;

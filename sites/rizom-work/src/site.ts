/// <reference types="./types.d.ts" />

import type { SiteDefinition } from "@rizom/site";
import { createRizomSite } from "@rizom/site-rizom";
import { WorkLayout } from "./layout";
import { workRoutes } from "./routes";
import workSiteContent from "./site-content";
import themeOverride from "./theme.css" with { type: "text" };

export const rizomWorkSite: SiteDefinition = createRizomSite({
  packageName: "@rizom/site-rizom-work",
  themeProfile: "studio",
  layout: WorkLayout,
  routes: workRoutes,
  content: workSiteContent,
  themeOverride,
});

export default rizomWorkSite;

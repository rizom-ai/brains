import type { SiteDefinition } from "@rizom/site";
import { createRizomSite } from "@rizom/site-rizom";
import { FoundationLayout } from "./layout";
import { foundationRoutes } from "./routes";
import foundationSiteContent from "./site-content";
import themeOverride from "./theme.css" with { type: "text" };

export const rizomFoundationSite: SiteDefinition = createRizomSite({
  packageName: "@rizom/site-rizom-foundation",
  themeProfile: "editorial",
  layout: FoundationLayout,
  routes: foundationRoutes,
  content: foundationSiteContent,
  themeOverride,
});

export default rizomFoundationSite;

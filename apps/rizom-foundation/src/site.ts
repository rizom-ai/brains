import { createRizomSite } from "@brains/site-rizom";
import { FoundationLayout } from "./layout";
import { foundationRoutes } from "./routes";
import { foundationTemplates } from "./templates";

export default createRizomSite({
  packageName: "rizom-foundation-site",
  contentNamespace: "landing-page",
  themeProfile: "editorial",
  layout: FoundationLayout,
  routes: foundationRoutes,
  templates: foundationTemplates,
});

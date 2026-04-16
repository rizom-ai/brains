import { createRizomSite } from "@brains/site-rizom";
import { FoundationLayout } from "./layout";
import { foundationRoutes } from "./routes";
import { foundationTemplates } from "./templates";

export default createRizomSite({
  packageName: "rizom-foundation-site",
  variant: "foundation",
  layout: FoundationLayout,
  routes: foundationRoutes,
  templates: foundationTemplates,
});

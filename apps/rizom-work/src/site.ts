import { createRizomSite } from "@brains/site-rizom";
import { WorkLayout } from "./layout";
import { workRoutes } from "./routes";
import { workTemplates } from "./templates";

export default createRizomSite({
  packageName: "rizom-work-site",
  themeProfile: "studio",
  layout: WorkLayout,
  routes: workRoutes,
  templates: workTemplates,
});

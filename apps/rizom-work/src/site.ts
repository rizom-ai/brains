import { createRizomSite } from "@brains/site-rizom";
import { WorkLayout } from "./layout";
import { workRoutes } from "./routes";
import { workTemplates } from "./templates";

export default createRizomSite({
  packageName: "rizom-work-site",
  variant: "work",
  layout: WorkLayout,
  routes: workRoutes,
  templates: workTemplates,
});

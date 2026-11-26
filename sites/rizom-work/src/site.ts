import { createRizomSite, type SitePackage } from "@rizom/site-rizom-ai";
import { workSections } from "./home";
import { WorkLayout } from "./layout";
import { workOrganism } from "./organism";
import { workRoutes } from "./routes";

export const rizomWorkSite: SitePackage = createRizomSite({
  packageName: "@rizom/site-rizom-work",
  layout: WorkLayout,
  routes: workRoutes,
  sections: [workSections],
  organisms: [workOrganism],
});

export default rizomWorkSite;

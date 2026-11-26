import { createRizomSite, type SitePackage } from "@rizom/site-rizom-ai";
import { foundationSections } from "./home";
import { FoundationLayout } from "./layout";
import { foundationOrganism } from "./organism";
import { readingSections } from "./reading";
import { foundationRoutes } from "./routes";
import { FOUNDATION_STYLESHEET_PATH, foundationStyles } from "./styles";

export const rizomFoundationSite: SitePackage = createRizomSite({
  packageName: "@rizom/site-rizom-foundation",
  layout: FoundationLayout,
  routes: foundationRoutes,
  sections: [foundationSections, readingSections],
  organisms: [foundationOrganism],
  staticAssets: { [FOUNDATION_STYLESHEET_PATH]: foundationStyles },
});

export default rizomFoundationSite;

import { createRizomSite, type SitePackage } from "./rizom";
import { AiLayout } from "./layout";
import { homeSections } from "./home";
import { livingMemorySections } from "./living-memory";
import { brainSections } from "./brain";
import { openingTemplate } from "./opening";
import { openingDataSource } from "./opening-datasource";
import { workSections } from "./work";
import { foundationSections } from "./foundation";
import { aiRoutes } from "./routes";
import { publicAskSections } from "./public-ask";

export const rizomAiSite: SitePackage = createRizomSite({
  packageName: "@rizom/site-rizom-ai",
  // The story pages draw their own organisms (see ./story). The theme's
  // room accents key off data-room, set by the layout.
  layout: AiLayout,
  routes: aiRoutes,
  runtime: {
    contentNamespace: "rizom",
    templates: { opening: openingTemplate },
    dataSourceFactories: [openingDataSource],
  },
  // Every page is authored schema-first (see ./home, ./brain, ./work,
  // ./foundation).
  sections: [
    homeSections,
    livingMemorySections,
    brainSections,
    publicAskSections,
    workSections,
    foundationSections,
  ],
  // The archive (/writing) is a hand-written route that composes the plugins'
  // own list templates; entityDisplay just supplies the labels + detail-page
  // paths. Navigation is hidden — the layout's bar owns the nav, so the
  // auto-generated per-type indexes stay unlinked.
  entityDisplay: {
    post: { label: "Essay", navigation: { show: false } },
    deck: { label: "Talk", navigation: { show: false } },
    agent: { label: "Agent", navigation: { show: false } },
  },
});

export default rizomAiSite;

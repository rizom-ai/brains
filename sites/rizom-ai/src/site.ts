import { createRizomSite, type SitePackage } from "./rizom";
import { AiLayout } from "./layout";
import { livingMemorySections } from "./living-memory";
import { brainSections } from "./brain";
import { openingTemplate } from "./opening";
import { openingDataSource } from "./opening-datasource";
import { writingTemplate } from "./writing";
import { writingDataSource } from "./writing-datasource";
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
    templates: { opening: openingTemplate, writing: writingTemplate },
    dataSourceFactories: [openingDataSource, writingDataSource],
  },
  // Every page is authored schema-first (see ./living-memory, ./brain,
  // ./work, ./foundation).
  sections: [
    livingMemorySections,
    brainSections,
    publicAskSections,
    workSections,
    foundationSections,
  ],
  // The archive (/writing) reads the plugins' lists through its own
  // datasource (see ./writing-datasource); entityDisplay supplies the labels
  // and detail-page paths the site builder links each piece by. Navigation is hidden — the layout's bar owns the nav, so the
  // auto-generated per-type indexes stay unlinked.
  entityDisplay: {
    post: { label: "Essay", navigation: { show: false } },
    deck: { label: "Talk", navigation: { show: false } },
    agent: { label: "Agent", navigation: { show: false } },
  },
});

export default rizomAiSite;

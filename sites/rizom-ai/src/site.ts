import { createRizomSite, type SitePackage } from "./rizom";
import { AiLayout } from "./layout";
import { livingMemorySections } from "./living-memory";
import { brainSections } from "./brain";
import { openingTemplate } from "./opening";
import { openingDataSource } from "./opening-datasource";
import { askedTemplate } from "./asked";
import { askRoomTemplate } from "./ask-room";
import { askedDataSource } from "./asked-datasource";
import { writingTemplate } from "./writing";
import { writingDataSource } from "./writing-datasource";
import { workSections } from "./work";
import { foundationSections } from "./foundation";
import { aiRoutes } from "./routes";
import { rizomAtprotoLexiconStaticAssets } from "./rizom/runtime/plugin";
import { brainOrganism } from "./story/brain-organism";
import { foundationOrganism } from "./story/foundation-organism";
import { livingOrganism } from "./story/living-organism";
import { workOrganism } from "./story/work-organism";

export const rizomAiSite: SitePackage = createRizomSite({
  packageName: "@rizom/site-rizom-ai",
  // The story pages draw their own organisms (see ./story). The theme's
  // room accents key off data-room, set by the layout.
  layout: AiLayout,
  routes: aiRoutes,
  organisms: [livingOrganism, brainOrganism, workOrganism, foundationOrganism],
  // rizom.ai is the authority for the ATProto lexicons and serves them.
  staticAssets: rizomAtprotoLexiconStaticAssets,
  runtime: {
    contentNamespace: "rizom",
    templates: {
      opening: openingTemplate,
      writing: writingTemplate,
      asked: askedTemplate,
      "ask-room": askRoomTemplate,
    },
    dataSources: [openingDataSource, writingDataSource, askedDataSource],
  },
  // Every page is authored schema-first (see ./living-memory, ./brain,
  // ./work, ./foundation).
  sections: [
    livingMemorySections,
    brainSections,
    workSections,
    foundationSections,
  ],
  // The archive (/writing) reads the plugins' lists through its own
  // datasource (see ./writing-datasource); entityDisplay supplies the labels
  // and detail-page paths the site builder links each piece by. Navigation is hidden — the layout's bar owns the nav, so the
  // auto-generated per-type indexes stay unlinked.
  // What a visitor's answer may cite: the site's own pieces.
  entityDisplay: {
    post: { label: "Essay", citable: true, navigation: { show: false } },
    deck: { label: "Talk", citable: true, navigation: { show: false } },
    agent: { label: "Agent", citable: true, navigation: { show: false } },
  },
});

export default rizomAiSite;

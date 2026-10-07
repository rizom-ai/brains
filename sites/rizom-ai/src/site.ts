import type { SitePackage } from "./rizom";
import { createInternalRizomSite } from "./rizom/create-site";
import { AiLayout } from "./layout";
import { livingMemorySections } from "./living-memory";
import { brainSections } from "./brain";
import { openingTemplate } from "./opening";
import { openingDataSource } from "./opening-datasource";
import { askedTemplate } from "./asked";
import { askedDataSource } from "./asked-datasource";
import { writingTemplate } from "./writing";
import { writingDataSource } from "./writing-datasource";
import { workSections } from "./work";
import { foundationSections } from "./foundation";
import { aiRoutes } from "./routes";
import { askRoomTemplate } from "./ask-room";

export const rizomAiSite: SitePackage = createInternalRizomSite(
  {
    packageName: "@rizom/site-rizom-ai",
    // The story pages draw their own organisms (see ./story). The theme's
    // room accents key off data-room, set by the layout.
    layout: AiLayout,
    routes: aiRoutes,
    runtime: {
      contentNamespace: "rizom",
      templates: {
        opening: openingTemplate,
        writing: writingTemplate,
        asked: askedTemplate,
        "ask-room": askRoomTemplate,
      },
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
    entityDisplay: {
      post: { label: "Essay", citable: true, navigation: { show: false } },
      deck: { label: "Talk", citable: true, navigation: { show: false } },
      "network-piece": {
        label: "From the network",
        citable: true,
        navigation: { show: false },
      },
      agent: { label: "Agent", citable: true, navigation: { show: false } },
    },
  },
  [
    openingDataSource,
    writingDataSource,
    (shell): ReturnType<typeof askedDataSource> =>
      askedDataSource({
        faq: () => shell.getDataSourceRegistry().get("@brains/faq:entities"),
        map: () =>
          shell
            .getDataSourceRegistry()
            .get("@brains/agent-discovery:proximity-map"),
      }),
  ],
);

export default rizomAiSite;

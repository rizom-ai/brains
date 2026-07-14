import type { SiteDefinition } from "@rizom/site";
import { createRizomSite } from "@rizom/site-rizom";
import { AiLayout } from "./layout";
import { homeSections } from "./home";
import { brainSections } from "./brain";
import { workSections } from "./work";
import { foundationSections } from "./foundation";
import { aiRoutes } from "./routes";

export const rizomAiSite: SiteDefinition = createRizomSite({
  packageName: "@rizom/site-rizom-ai",
  // No themeProfile: the rev-5 design draws its own motifs (mycelium rail,
  // growth diagram) — no profile canvas, no data-theme-profile. The theme's
  // room accents key off data-room, set by the layout.
  layout: AiLayout,
  routes: aiRoutes,
  // Every page is authored schema-first (see ./home, ./brain, ./work,
  // ./foundation).
  sections: [homeSections, brainSections, workSections, foundationSections],
  // The org-level indexes (/writing, /network) are hand-written routes that
  // compose the plugins' own list templates; entityDisplay just supplies the
  // labels + detail-page paths. Navigation is hidden — the layout's faces
  // strip owns the nav, so the auto-generated per-type indexes stay unlinked.
  entityDisplay: {
    post: { label: "Essay", navigation: { show: false } },
    deck: { label: "Talk", navigation: { show: false } },
    agent: { label: "Agent", navigation: { show: false } },
  },
});

export default rizomAiSite;

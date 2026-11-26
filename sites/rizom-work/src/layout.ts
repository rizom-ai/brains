import {
  createSiteLayout,
  threeSiteFooter,
  type SiteLayout,
} from "@rizom/site-rizom-ai";
import { workOrganism } from "./organism";

/**
 * rizom.work's chrome: one of the three sites, in the practice's light, its
 * home told beside Rizom Work's drawing.
 */
export const WorkLayout: SiteLayout = createSiteLayout({
  site: "work",
  room: "work",
  barLinks: [
    { label: "For hubs", href: "/#hubs" },
    { label: "For teams", href: "/#teams" },
    { label: "Public bodies", href: "/#public" },
    { label: "Partners", href: "/#partners" },
  ],
  cta: { label: "Talk to us", href: "/contact" },
  footerColumns: threeSiteFooter("work"),
  footerNote:
    "Rizom B.V. runs hosting and client work under license from the Rizom Foundation and pays 25% of every engagement back to the commons.",
  figures: {
    "/": { className: "work-org", organism: workOrganism },
  },
});

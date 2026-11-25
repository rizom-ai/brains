import {
  createSiteLayout,
  threeSiteFooter,
  type SiteLayout,
} from "@rizom/site-rizom-ai";
import { foundationOrganism } from "./organism";

/**
 * rizom.foundation's chrome: one of the three sites, in the Foundation's
 * light on every page, its home told beside the Foundation's drawing.
 */
export const FoundationLayout: SiteLayout = createSiteLayout({
  site: "foundation",
  room: "foundation",
  barLinks: [
    { label: "Common Sense", href: "/common-sense" },
    { label: "Writing", href: "/#writing" },
    { label: "Events", href: "/#events" },
    { label: "Support", href: "/#support" },
  ],
  cta: {
    label: "Become a founding supporter",
    short: "Pledge",
    href: "/support",
  },
  footerColumns: threeSiteFooter("foundation"),
  footerNote:
    "The Rizom Foundation owns the code, the method and the Rizom name.",
  figures: {
    "/": { className: "commons-org", organism: foundationOrganism },
  },
});

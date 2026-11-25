import { createSiteLayout, type Room, type SiteLayout } from "./site-layout";
import { brainOrganism } from "./story/brain-organism";
import { foundationOrganism } from "./story/foundation-organism";
import { livingOrganism } from "./story/living-organism";
import { workOrganism } from "./story/work-organism";

/**
 * rizom.ai's chrome (see ./site-layout): the rooms and the archive in the
 * bar, each room in its own light, and the footer's three columns.
 */

// The active room drives the accent (data-room). Home and the archive wear
// brass, the theme's default.
function activeRoom(path: string): Room {
  if (path === "/work" || path.startsWith("/work/")) return "work";
  if (path === "/foundation" || path.startsWith("/foundation/")) {
    return "foundation";
  }
  return "brain";
}

export const AiLayout: SiteLayout = createSiteLayout({
  room: activeRoom,
  // The rooms keep their own light: brass for the platform, ruby for the
  // practice, moss for the research. Writing is the archive.
  barLinks: [
    { label: "Brain", href: "/brain", room: "brain" },
    { label: "Work", href: "/work", room: "work" },
    { label: "Foundation", href: "/foundation", room: "foundation" },
    { label: "Writing", href: "/writing" },
    { label: "Ask", href: "/ask" },
  ],
  cta: { label: "Book an audit", href: "/work#audit" },
  footerColumns: [
    {
      heading: "The brain",
      links: [
        { label: "Get started", href: "/brain#quickstart" },
        { label: "Documentation ↗", href: "https://docs.rizom.ai" },
        { label: "GitHub ↗", href: "https://github.com/rizom-ai" },
      ],
    },
    {
      heading: "The practice",
      links: [
        { label: "The Knowledge Audit", href: "/work#audit" },
        { label: "Contact", href: "/contact" },
      ],
    },
    {
      heading: "The foundation",
      links: [
        { label: "Manifesto", href: "/foundation" },
        { label: "Writing", href: "/writing" },
        { label: "Events", href: "/foundation#events" },
        { label: "Support", href: "/foundation#support" },
      ],
    },
  ],
  // The pages told as a story, and the drawing each one scrolls beside; the
  // Ask room brings its own drawing and has no figure.
  figures: {
    "/": { className: "living-org", organism: livingOrganism },
    "/brain": { className: "brain-org", organism: brainOrganism },
    "/work": { className: "work-org", organism: workOrganism },
    "/foundation": {
      className: "foundation-org",
      organism: foundationOrganism,
    },
    "/ask": null,
  },
});

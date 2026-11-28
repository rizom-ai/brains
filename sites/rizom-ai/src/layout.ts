import { createSiteLayout, type SiteLayout } from "./site-layout";
import { brainOrganism } from "./story/brain-organism";
import { livingOrganism } from "./story/living-organism";

/**
 * rizom.ai's chrome (see ./site-layout): the rooms and the archive in the
 * bar, each room in its own light, and the footer's three columns.
 */

export const AiLayout: SiteLayout = createSiteLayout({
  // Every page wears the platform's brass. Rizom Work and the Foundation
  // speak on their own sites; their links keep their light.
  room: "brain",
  barLinks: [
    { label: "Brain", href: "/brain", room: "brain" },
    { label: "Work", href: "https://rizom.work", room: "work" },
    {
      label: "Foundation",
      href: "https://rizom.foundation",
      room: "foundation",
    },
    { label: "Writing", href: "/writing" },
    { label: "Ask", href: "/ask" },
  ],
  cta: { label: "Get started", href: "/brain#quickstart" },
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
        { label: "For hubs", href: "https://rizom.work/#hubs" },
        { label: "For teams", href: "https://rizom.work/#teams" },
        { label: "Talk to us", href: "https://rizom.work/contact" },
      ],
    },
    {
      heading: "The foundation",
      links: [
        {
          label: "Common Sense",
          href: "https://rizom.foundation/common-sense",
        },
        { label: "Writing", href: "/writing" },
        { label: "Events", href: "https://rizom.foundation/#events" },
        { label: "Support", href: "https://rizom.foundation/support" },
      ],
    },
  ],
  // The pages told as a story, and the drawing each one scrolls beside; the
  // Ask room brings its own drawing and has no figure.
  figures: {
    "/": { className: "living-org", organism: livingOrganism },
    "/brain": { className: "brain-org", organism: brainOrganism },
    "/ask": null,
  },
});

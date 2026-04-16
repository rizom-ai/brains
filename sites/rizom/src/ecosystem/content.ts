import type { EcosystemContent, EcosystemSuffix } from "./schema";

const CARDS: Record<
  EcosystemSuffix,
  { title: string; body: string; href: string; linkLabel: string }
> = {
  ai: {
    title: "The platform",
    body: "Open-source AI agents built from your own knowledge. The tools that make everything else possible.",
    href: "https://rizom.ai",
    linkLabel: "See the platform →",
  },
  foundation: {
    title: "The vision",
    body: "Essays, principles, and community. Why we believe the future of knowledge work is distributed, owned, and play.",
    href: "https://rizom.foundation",
    linkLabel: "Read the manifesto →",
  },
  work: {
    title: "The network",
    body: "Distributed consultancy powered by brains. Specialized expertise that mobilizes in hours, not months. Teams that assemble themselves.",
    href: "https://rizom.work",
    linkLabel: "Work with us →",
  },
};

const ORDER: EcosystemSuffix[] = ["ai", "foundation", "work"];

export const createEcosystemContent = (
  active: EcosystemSuffix,
): EcosystemContent => ({
  cards: ORDER.map((suffix) => ({
    suffix,
    title: CARDS[suffix].title,
    body: CARDS[suffix].body,
    linkHref: suffix === active ? "/" : CARDS[suffix].href,
    linkLabel: suffix === active ? "You are here" : CARDS[suffix].linkLabel,
  })),
});

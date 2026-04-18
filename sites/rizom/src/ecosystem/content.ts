import type { EcosystemContent, EcosystemSuffix } from "./schema";

const CARDS: Record<
  EcosystemSuffix,
  {
    title: string;
    body: string;
    href: string;
    linkLabel: string;
    live: boolean;
  }
> = {
  ai: {
    title: "The platform",
    body: "Open-source AI agents built from your own knowledge. The tools that make everything else possible.",
    href: "https://rizom.ai",
    linkLabel: "See the platform →",
    live: true,
  },
  foundation: {
    title: "The vision",
    body: "Essays, principles, and community. Why we believe the future of knowledge work is distributed, owned, and play.",
    href: "https://rizom.foundation",
    linkLabel: "Read the manifesto →",
    live: false,
  },
  work: {
    title: "The network",
    body: "Distributed consultancy powered by brains. Specialized expertise that mobilizes in hours, not months. Teams that assemble themselves.",
    href: "https://rizom.work",
    linkLabel: "Work with us →",
    live: false,
  },
};

const ORDER: EcosystemSuffix[] = ["ai", "foundation", "work"];

export interface EcosystemHeader {
  eyebrow: string;
  headline: string;
}

export const createEcosystemContent = (
  active: EcosystemSuffix,
  header: EcosystemHeader,
): EcosystemContent => ({
  eyebrow: header.eyebrow,
  headline: header.headline,
  cards: ORDER.map((suffix) => {
    const card = CARDS[suffix];
    if (suffix === active) {
      return {
        suffix,
        title: card.title,
        body: card.body,
        linkHref: "/",
        linkLabel: "You are here",
      };
    }
    if (!card.live) {
      return {
        suffix,
        title: card.title,
        body: card.body,
        linkHref: "",
        linkLabel: "Coming soon",
      };
    }
    return {
      suffix,
      title: card.title,
      body: card.body,
      linkHref: card.href,
      linkLabel: card.linkLabel,
    };
  }),
});

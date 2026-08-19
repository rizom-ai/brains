import type { EcosystemContent } from "./Ecosystem";
import type { RizomBrandSuffix } from "./types";

const HERE_LABEL = "You are here";

/**
 * Default ecosystem content, sourced from rizom.work brain-data:
 * ../rizom-work/brain-data/site-content/home/ecosystem.md
 */
const DEFAULT_CARDS = [
  {
    suffix: "work",
    title: "The service",
    body: "Workshops and consulting that apply the methodology in live engagements.",
    linkLabel: "Visit rizom.work →",
    linkHref: "https://rizom.work",
  },
  {
    suffix: "foundation",
    title: "The source",
    body: "The non-profit that holds the IP and stewards the methodology independently.",
    linkLabel: "Read the manifesto →",
    linkHref: "https://rizom.foundation",
  },
  {
    suffix: "ai",
    title: "The tools",
    body: "Open-source AI agents built on the methodology, the technical layer underneath.",
    linkLabel: "See the platform →",
    linkHref: "https://rizom.ai",
  },
] as const;

export function getRizomEcosystemContent(
  current?: RizomBrandSuffix,
): EcosystemContent {
  return {
    eyebrow: "The Ecosystem",
    headline: "One practice. *Three faces.*",
    cards: DEFAULT_CARDS.map((card) =>
      card.suffix === current
        ? { ...card, linkLabel: HERE_LABEL, linkHref: "" }
        : card,
    ),
  };
}

export const rizomEcosystemContent: EcosystemContent =
  getRizomEcosystemContent();

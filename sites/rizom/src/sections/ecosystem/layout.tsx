import type { JSX } from "preact";
import { Section } from "../../components/Section";
import { EcoCard, type EcoCardProps } from "../../components/EcoCard";
import { getVariant, type RizomVariant } from "../../variant";

interface EcoCardData extends Omit<EcoCardProps, "active" | "revealDelay"> {
  variant: RizomVariant;
}

const CARDS: EcoCardData[] = [
  {
    variant: "ai",
    suffix: "ai",
    title: "The platform",
    body: "Open-source AI agents built from your own knowledge. The tools that make everything else possible.",
    linkLabel: "Visit rizom.ai →",
    linkHref: "https://rizom.ai",
    linkClass: "text-accent",
    barGradient:
      "linear-gradient(90deg,transparent,var(--color-accent)_30%,var(--color-accent)_70%,transparent)",
    glowVar: "--color-glow-eco-ai",
  },
  {
    variant: "foundation",
    suffix: "foundation",
    title: "The vision",
    body: "Essays, principles, and community. Why we believe the future of knowledge work is distributed, owned, and play.",
    linkLabel: "Read the manifesto →",
    linkHref: "https://rizom.foundation",
    linkClass: "text-secondary",
    barGradient:
      "linear-gradient(90deg,transparent,var(--color-secondary)_30%,var(--color-secondary)_70%,transparent)",
    glowVar: "--color-glow-eco-foundation",
  },
  {
    variant: "work",
    suffix: "work",
    title: "The network",
    body: "Distributed consultancy powered by brains. Specialized expertise that mobilizes in hours, not months. Teams that assemble themselves.",
    linkLabel: "Work with us →",
    linkHref: "https://rizom.work",
    linkClass: "text-secondary",
    barGradient:
      "linear-gradient(90deg,transparent,var(--color-brand-light)_30%,var(--color-secondary)_70%,transparent)",
    glowVar: "--color-glow-eco-work",
  },
];

export const EcosystemLayout = (): JSX.Element => {
  const currentVariant = getVariant();
  return (
    <Section id="ecosystem" className="reveal pt-section pb-16 md:pb-24">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        {CARDS.map(({ variant, ...card }, i) => (
          <EcoCard
            key={variant}
            {...card}
            active={variant === currentVariant}
            revealDelay={`reveal-delay-${i + 1}`}
          />
        ))}
      </div>
    </Section>
  );
};

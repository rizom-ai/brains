import type { HeroContent } from "./sections/hero/schema";

/**
 * Like Required<T> but also strips `undefined` from each property's
 * value type. `Required<{ foo?: string | undefined }>` keeps the
 * `| undefined`; this helper doesn't.
 */
type Concrete<T> = { [K in keyof T]-?: NonNullable<T[K]> };

export type RizomVariant = "ai" | "foundation" | "work";

/**
 * Module-level variant store. The RizomSitePlugin calls setVariant()
 * at onRegister time with the config value, and section components
 * read it (indirectly, via the *Defaults lookups below) at SSR time.
 *
 * This works because the brain runs as a single process with a
 * single variant active. If we ever support multi-variant in one
 * process, this becomes a Preact context instead.
 */
let currentVariant: RizomVariant = "ai";

export const setVariant = (variant: RizomVariant): void => {
  currentVariant = variant;
};

export const getVariant = (): RizomVariant => currentVariant;

/**
 * Variant-specific hero copy. The hero component uses these as
 * defaults when the route's content doesn't override a field.
 * Content overrides (via site-content entities) still take priority.
 */
export const HERO_DEFAULTS: Record<RizomVariant, Concrete<HeroContent>> = {
  ai: {
    headline: "Build the agent that represents you",
    subhead:
      "Your knowledge becomes an AI agent. Your agent joins a network. The network finds the right expert for every problem — matched by what people actually know.",
    primaryCtaLabel: "Get Your Brain →",
    primaryCtaHref: "#quickstart",
    secondaryCtaLabel: "How The Network Works",
    secondaryCtaHref: "#answer",
  },
  foundation: {
    headline: "The future of work is play",
    subhead:
      "Essays, principles, and community. Why we believe the future of knowledge work is distributed, owned, and deeply human. Where talent flows to opportunity and professionals own what they create.",
    primaryCtaLabel: "Read the manifesto →",
    primaryCtaHref: "#mission",
    secondaryCtaLabel: "Explore the ecosystem",
    secondaryCtaHref: "#ecosystem",
  },
  work: {
    headline: "Distributed expertise, on demand",
    subhead:
      "A network of specialists powered by brains. Teams that assemble themselves around the work. Hours, not months, to mobilize exactly the right people.",
    primaryCtaLabel: "Work with us →",
    primaryCtaHref: "#quickstart",
    secondaryCtaLabel: "How the network works",
    secondaryCtaHref: "#answer",
  },
};

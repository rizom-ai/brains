import { createTemplate, type Template } from "@brains/templates";
import { z } from "@brains/utils/zod";
import {
  FoundationHeroSection,
  HomeHeroSection,
  WorkHeroSection,
  type CtaLink,
  type FoundationHeroContent,
  type HomeHeroContent,
  type WorkHeroContent,
} from "./sections";

const ctaLinkSchema: z.ZodType<CtaLink> = z.object({
  label: z.string(),
  href: z.string(),
});

export const homeHeroContentSchema: z.ZodType<HomeHeroContent> = z.object({
  kicker: z.string(),
  headline: z.string(),
  standfirst: z.string(),
  primaryCta: ctaLinkSchema,
  secondaryCta: ctaLinkSchema,
});

export const workHeroContentSchema: z.ZodType<WorkHeroContent> = z.object({
  eyebrow: z.string(),
  provenance: z.string(),
  headline: z.string(),
  standfirst: z.string(),
  primaryCta: ctaLinkSchema,
  secondaryCta: ctaLinkSchema,
});

export const foundationHeroContentSchema: z.ZodType<FoundationHeroContent> =
  z.object({
    volume: z.string(),
    meta: z.string(),
    headline: z.string(),
    standfirst: z.string(),
    primaryCta: ctaLinkSchema,
    secondaryCta: ctaLinkSchema,
  });

export const HOME_HERO_FALLBACK: HomeHeroContent = {
  kicker: "Open source · self-hosted · your knowledge",
  headline: "Build the agent that *represents you*",
  standfirst:
    "Your knowledge becomes an AI agent. Your agent joins a network. The network finds the right expert for every problem, matched by what people actually know.",
  primaryCta: { label: "Get Your Brain →", href: "#hero" },
  secondaryCta: { label: "Talk to this brain", href: "/chat" },
};

export const WORK_HERO_FALLBACK: WorkHeroContent = {
  eyebrow: "Coordination for the AI era",
  provenance: "previously rizom.work",
  headline: "Your team has a knowledge problem. *AI is making it visible.*",
  standfirst:
    "TMS-based consulting that helps teams coordinate better, so your people and your AI tools can actually do their best work.",
  primaryCta: { label: "Take the Team Type quiz →", href: "/work#quiz" },
  secondaryCta: { label: "Book a discovery call", href: "/work#contact" },
};

export const FOUNDATION_HERO_FALLBACK: FoundationHeroContent = {
  volume: "Vol. 01 · 2026",
  meta: "Essays · Events · Public infrastructure · previously rizom.foundation",
  headline:
    "Work is broken* — and the institutions organizing it were built for a different century.*",
  standfirst:
    "A research arm for the social contracts that quietly hold both work and technology together: essays, city-by-city gatherings, and stewardship of the open AI infrastructure this community runs on.",
  primaryCta: { label: "Join our Discord →", href: "/foundation#events" },
  secondaryCta: {
    label: "Find an event near you",
    href: "/foundation#events",
  },
};

// Registered by the site's own plugin (via createRizomSite), so the package
// renders in any brain regardless of which content plugins it carries.
export const rizomAiTemplates: Record<string, Template> = {
  "home-hero": createTemplate<HomeHeroContent>({
    name: "home-hero",
    description: "Platform-first homepage hero (rizom.ai)",
    schema: homeHeroContentSchema,
    requiredPermission: "public",
    layout: { component: HomeHeroSection },
  }),
  "work-hero": createTemplate<WorkHeroContent>({
    name: "work-hero",
    description: "The practice's room head (previously rizom.work)",
    schema: workHeroContentSchema,
    requiredPermission: "public",
    layout: { component: WorkHeroSection },
  }),
  "foundation-hero": createTemplate<FoundationHeroContent>({
    name: "foundation-hero",
    description: "The research arm's masthead (previously rizom.foundation)",
    schema: foundationHeroContentSchema,
    requiredPermission: "public",
    layout: { component: FoundationHeroSection },
  }),
};

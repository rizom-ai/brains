import type { JSX, ComponentChildren } from "preact";
import type { RouteDefinitionInput } from "@brains/site-composition";
import type { SiteContentDefinition } from "@brains/site-content";
import { z } from "@brains/utils";
import {
  Button,
  RizomFrame,
  Section,
  createRizomSite,
  type RizomLayoutProps,
} from "@brains/site-rizom";

const ctaLinkSchema = z.object({
  label: z.string(),
  href: z.string(),
});

const relayHeroContentSchema = z.object({
  eyebrow: z.string(),
  headline: z.string(),
  intro: z.string(),
  primaryCta: ctaLinkSchema,
  secondaryCta: ctaLinkSchema,
  signals: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
      note: z.string(),
    }),
  ),
});

const relayLoopContentSchema = z.object({
  eyebrow: z.string(),
  title: z.string(),
  intro: z.string(),
  steps: z.array(
    z.object({
      phase: z.string(),
      title: z.string(),
      text: z.string(),
    }),
  ),
});

const relaySurfaceContentSchema = z.object({
  title: z.string(),
  intro: z.string(),
  cards: z.array(
    z.object({
      label: z.string(),
      title: z.string(),
      text: z.string(),
    }),
  ),
});

const relayAboutContentSchema = z.object({
  title: z.string(),
  intro: z.string(),
  points: z.array(z.string()),
});

type CtaLink = z.infer<typeof ctaLinkSchema>;
type RelayHeroContent = z.infer<typeof relayHeroContentSchema>;
type RelayLoopContent = z.infer<typeof relayLoopContentSchema>;
type RelaySurfaceContent = z.infer<typeof relaySurfaceContentSchema>;
type RelayAboutContent = z.infer<typeof relayAboutContentSchema>;

const HOME_HERO_FALLBACK: RelayHeroContent = {
  eyebrow: "Team memory / public signal",
  headline: "Relay turns shared work into a living knowledge surface.",
  intro:
    "Capture decisions, links, and field notes where collaboration already happens, then synthesize them into a public-facing homepage your team can keep current.",
  primaryCta: { label: "Explore the relay", href: "#operating-loop" },
  secondaryCta: { label: "Read the model", href: "/about" },
  signals: [
    {
      label: "Capture",
      value: "Notes + links",
      note: "Low-friction shared context",
    },
    {
      label: "Synthesis",
      value: "Topics + summaries",
      note: "Durable memory from live work",
    },
    {
      label: "Coordination",
      value: "Peer brains",
      note: "Approved agent-to-agent exchange",
    },
  ],
};

const HOME_LOOP_FALLBACK: RelayLoopContent = {
  eyebrow: "Default relay loop",
  title:
    "A homepage should explain the operating rhythm, not pretend to be a brochure.",
  intro:
    "Relay's default site frames the team brain as an active memory system: what comes in, how it gets shaped, and where it becomes useful again.",
  steps: [
    {
      phase: "01",
      title: "Capture the trace",
      text: "Team notes, links, and chat context enter as simple entities with sourceable metadata.",
    },
    {
      phase: "02",
      title: "Synthesize the pattern",
      text: "Summaries and topics turn raw capture into a map of what the team already knows.",
    },
    {
      phase: "03",
      title: "Share the surface",
      text: "A minimal public site exposes the stable story while private memory keeps moving underneath.",
    },
  ],
};

const HOME_SURFACE_FALLBACK: RelaySurfaceContent = {
  title: "The default Relay template",
  intro:
    "The shape is intentionally simple: a clear positioning hero, the capture → synthesize → share loop, and a few proof surfaces that can be swapped for richer routes in the full preset.",
  cards: [
    {
      label: "Private by default",
      title: "Core memory stays operational.",
      text: "The public site is only a surface on top of the team brain; Discord, MCP, A2A, notes, links, topics, and summaries remain the center of gravity.",
    },
    {
      label: "Editable content",
      title: "Homepage sections are durable entities.",
      text: "Each section is backed by site-content markdown, so the sample copy becomes real starter content instead of hardcoded demo text.",
    },
    {
      label: "Full preset ready",
      title: "Docs and decks can become the knowledge hub.",
      text: "The default preset stays minimal; full Relay instances can layer in docs, decks, and richer collection routes without changing the homepage contract.",
    },
  ],
};

const ABOUT_FALLBACK: RelayAboutContent = {
  title: "Relay is a collaborative team-memory brain.",
  intro:
    "It exists for teams that need to remember together: capturing what happened, summarizing why it matters, and coordinating with trusted peer brains when work crosses boundaries.",
  points: [
    "Not a personal blog engine or portfolio shell.",
    "Not a marketing automation stack.",
    "A small public face for a larger private knowledge workflow.",
  ],
};

const navItemClass =
  "font-body text-[15px] text-theme-muted transition-colors hover:text-theme";

function RelayNavLink({ href, label }: CtaLink): JSX.Element {
  return (
    <a href={href} className={navItemClass}>
      {label}
    </a>
  );
}

function RelayChrome({
  siteInfo,
  children,
}: {
  siteInfo: RizomLayoutProps["siteInfo"];
  children: ComponentChildren;
}): JSX.Element {
  const navLinks = [
    ...siteInfo.navigation.primary,
    ...siteInfo.navigation.secondary,
  ];
  const cta = siteInfo.cta ?? {
    buttonText: "Start here",
    buttonLink: "/about",
  };

  return (
    <RizomFrame>
      <nav className="fixed left-0 right-0 top-0 z-[100] flex items-center justify-between border-b border-theme-light bg-nav-fade px-6 py-4 backdrop-blur-[12px] md:px-10 xl:px-20">
        <a href="/" className="font-nav text-[20px]" aria-label="Relay home">
          <span className="font-bold text-theme">relay</span>
          <span className="font-bold text-accent">.</span>
          <span className="text-theme-muted">brain</span>
        </a>
        <div className="flex items-center gap-5 md:gap-8">
          <div className="hidden items-center gap-6 md:flex">
            {navLinks.map((link) => (
              <RelayNavLink key={`${link.href}-${link.label}`} {...link} />
            ))}
          </div>
          <a
            href={cta.buttonLink}
            className="rounded-[999px] border border-theme px-4 py-2 font-body text-[13px] font-semibold text-theme transition-colors hover:border-accent hover:text-accent md:px-5"
          >
            {cta.buttonText}
          </a>
        </div>
      </nav>
      <main>{children}</main>
      <footer className="relative z-[1] border-t border-theme-light px-6 py-8 md:px-10 xl:px-20">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-label text-label-sm uppercase tracking-[0.22em] text-theme-light">
              {siteInfo.copyright}
            </p>
            <p className="mt-2 max-w-[560px] font-body text-body-xs text-theme-muted">
              {siteInfo.description}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            {navLinks.map((link) => (
              <RelayNavLink
                key={`footer-${link.href}-${link.label}`}
                {...link}
              />
            ))}
            <button
              id="themeToggle"
              aria-label="Toggle light mode"
              className="rounded-md border border-theme-light bg-transparent px-2.5 py-1.5 font-body text-label-md text-theme-light transition-colors hover:border-theme hover:text-theme"
            >
              ☀ Light
            </button>
          </div>
        </div>
      </footer>
    </RizomFrame>
  );
}

export const RelayLayout = ({
  sections,
  siteInfo,
}: RizomLayoutProps): JSX.Element => (
  <RelayChrome siteInfo={siteInfo}>{sections}</RelayChrome>
);

export function RelayHeroSection({
  eyebrow,
  headline,
  intro,
  primaryCta,
  secondaryCta,
  signals,
}: RelayHeroContent): JSX.Element {
  return (
    <Section className="min-h-[92vh] pt-[152px] pb-20 md:pt-[190px]">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
        <div>
          <p className="font-label text-label-sm uppercase tracking-[0.28em] text-accent">
            {eyebrow}
          </p>
          <h1 className="mt-7 max-w-[980px] font-display text-display-lg text-theme">
            {headline}
          </h1>
          <p className="mt-7 max-w-[720px] font-body text-body-lg text-theme-muted">
            {intro}
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Button href={primaryCta.href} size="lg" variant="primary-strong">
              {primaryCta.label}
            </Button>
            <Button href={secondaryCta.href} size="lg" variant="secondary">
              {secondaryCta.label}
            </Button>
          </div>
        </div>
        <div className="rounded-[32px] border border-card-relay-border bg-card-relay-bg p-5 shadow-[0_24px_90px_var(--color-glow-relay)] backdrop-blur-sm">
          <p className="font-label text-label-xs uppercase tracking-[0.24em] text-theme-light">
            Live relay signals
          </p>
          <div className="mt-5 grid gap-3">
            {signals.map((signal) => (
              <div
                key={signal.label}
                className="rounded-[22px] border border-card-divider bg-bg-muted p-5"
              >
                <div className="flex items-center justify-between gap-4">
                  <p className="font-label text-label-xs uppercase tracking-[0.18em] text-secondary">
                    {signal.label}
                  </p>
                  <span className="h-2 w-2 rounded-full bg-accent shadow-[0_0_22px_var(--color-accent)]" />
                </div>
                <p className="mt-4 font-display text-display-sm text-theme">
                  {signal.value}
                </p>
                <p className="mt-2 font-body text-body-xs text-theme-muted">
                  {signal.note}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

export function RelayLoopSection({
  eyebrow,
  title,
  intro,
  steps,
}: RelayLoopContent): JSX.Element {
  return (
    <Section id="operating-loop" className="py-section">
      <div className="max-w-[840px]">
        <p className="font-label text-label-sm uppercase tracking-[0.28em] text-secondary">
          {eyebrow}
        </p>
        <h2 className="mt-5 font-display text-display-md text-theme">
          {title}
        </h2>
        <p className="mt-5 font-body text-body-md text-theme-muted">{intro}</p>
      </div>
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {steps.map((step) => (
          <article
            key={step.phase}
            className="min-h-[300px] rounded-[28px] border border-card-panel-border bg-card-panel-bg p-6"
          >
            <p className="font-label text-label-sm text-accent">{step.phase}</p>
            <h3 className="mt-16 font-display text-display-sm text-theme">
              {step.title}
            </h3>
            <p className="mt-4 font-body text-body-sm text-theme-muted">
              {step.text}
            </p>
          </article>
        ))}
      </div>
    </Section>
  );
}

export function RelaySurfaceSection({
  title,
  intro,
  cards,
}: RelaySurfaceContent): JSX.Element {
  return (
    <Section className="py-section">
      <div className="rounded-[36px] border border-theme-light bg-bg-muted p-6 md:p-10">
        <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
          <div>
            <h2 className="font-display text-display-md text-theme">{title}</h2>
            <p className="mt-5 font-body text-body-md text-theme-muted">
              {intro}
            </p>
          </div>
          <div className="grid gap-4">
            {cards.map((card) => (
              <article
                key={card.title}
                className="rounded-[24px] border border-card-divider bg-bg-subtle/70 p-5"
              >
                <p className="font-label text-label-xs uppercase tracking-[0.22em] text-accent">
                  {card.label}
                </p>
                <h3 className="mt-3 font-nav text-heading-lg text-theme">
                  {card.title}
                </h3>
                <p className="mt-2 font-body text-body-sm text-theme-muted">
                  {card.text}
                </p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

export function RelayAboutSection({
  title,
  intro,
  points,
}: RelayAboutContent): JSX.Element {
  return (
    <Section className="min-h-[78vh] pt-[150px] pb-section md:pt-[190px]">
      <div className="max-w-[920px]">
        <p className="font-label text-label-sm uppercase tracking-[0.28em] text-accent">
          Relay model
        </p>
        <h1 className="mt-6 font-display text-display-lg text-theme">
          {title}
        </h1>
        <p className="mt-7 font-body text-body-lg text-theme-muted">{intro}</p>
      </div>
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {points.map((point) => (
          <div
            key={point}
            className="rounded-[24px] border border-card-panel-current-border bg-card-panel-current-bg p-6 font-body text-body-md text-theme"
          >
            {point}
          </div>
        ))}
      </div>
    </Section>
  );
}

const RelayHeroSectionLayout = (props: unknown): JSX.Element =>
  RelayHeroSection(relayHeroContentSchema.parse(props));
const RelayLoopSectionLayout = (props: unknown): JSX.Element =>
  RelayLoopSection(relayLoopContentSchema.parse(props));
const RelaySurfaceSectionLayout = (props: unknown): JSX.Element =>
  RelaySurfaceSection(relaySurfaceContentSchema.parse(props));
const RelayAboutSectionLayout = (props: unknown): JSX.Element =>
  RelayAboutSection(relayAboutContentSchema.parse(props));

const ctaField = {
  type: "object",
  label: "CTA",
  fields: {
    label: { type: "string", label: "Label" },
    href: { type: "string", label: "Href" },
  },
} as const;

export const relaySiteContentDefinition: SiteContentDefinition = {
  namespace: "relay-site",
  sections: {
    "home-hero": {
      title: "Home hero",
      description: "Relay homepage hero section",
      layout: RelayHeroSectionLayout,
      fields: {
        eyebrow: { type: "string", label: "Eyebrow" },
        headline: { type: "string", label: "Headline" },
        intro: { type: "string", label: "Intro" },
        primaryCta: { ...ctaField, label: "Primary CTA" },
        secondaryCta: { ...ctaField, label: "Secondary CTA" },
        signals: {
          type: "array",
          label: "Signals",
          minItems: 1,
          items: {
            type: "object",
            label: "Signal",
            fields: {
              label: { type: "string", label: "Label" },
              value: { type: "string", label: "Value" },
              note: { type: "string", label: "Note" },
            },
          },
        },
      },
    },
    "home-loop": {
      title: "Home operating loop",
      description: "Relay capture, synthesis, and sharing loop",
      layout: RelayLoopSectionLayout,
      fields: {
        eyebrow: { type: "string", label: "Eyebrow" },
        title: { type: "string", label: "Title" },
        intro: { type: "string", label: "Intro" },
        steps: {
          type: "array",
          label: "Steps",
          minItems: 1,
          items: {
            type: "object",
            label: "Step",
            fields: {
              phase: { type: "string", label: "Phase" },
              title: { type: "string", label: "Title" },
              text: { type: "string", label: "Text" },
            },
          },
        },
      },
    },
    "home-surface": {
      title: "Home surface",
      description: "Relay default template explanation cards",
      layout: RelaySurfaceSectionLayout,
      fields: {
        title: { type: "string", label: "Title" },
        intro: { type: "string", label: "Intro" },
        cards: {
          type: "array",
          label: "Cards",
          minItems: 1,
          items: {
            type: "object",
            label: "Card",
            fields: {
              label: { type: "string", label: "Label" },
              title: { type: "string", label: "Title" },
              text: { type: "string", label: "Text" },
            },
          },
        },
      },
    },
    about: {
      title: "About Relay",
      description: "Default Relay about page",
      layout: RelayAboutSectionLayout,
      fields: {
        title: { type: "string", label: "Title" },
        intro: { type: "string", label: "Intro" },
        points: {
          type: "array",
          label: "Points",
          minItems: 1,
          items: { type: "string", label: "Point" },
        },
      },
    },
  },
};

export const relayRoutes: RouteDefinitionInput[] = [
  {
    id: "home",
    path: "/",
    title: "Relay",
    description: "Collaborative team memory and synthesis brain",
    layout: "default",
    navigation: {
      show: true,
      label: "Home",
      slot: "secondary",
      priority: 10,
    },
    sections: [
      {
        id: "hero",
        template: "relay-site:home-hero",
        content: HOME_HERO_FALLBACK,
      },
      {
        id: "loop",
        template: "relay-site:home-loop",
        content: HOME_LOOP_FALLBACK,
      },
      {
        id: "surface",
        template: "relay-site:home-surface",
        content: HOME_SURFACE_FALLBACK,
      },
    ],
  },
  {
    id: "about",
    path: "/about",
    title: "About Relay",
    description: "What Relay is designed to do",
    layout: "default",
    navigation: {
      show: true,
      label: "About",
      slot: "primary",
      priority: 20,
    },
    sections: [
      {
        id: "about",
        template: "relay-site:about",
        content: ABOUT_FALLBACK,
      },
    ],
  },
];

export const relaySite = createRizomSite({
  packageName: "@brains/relay/site",
  contentNamespace: "relay-site",
  themeProfile: "studio",
  layout: RelayLayout,
  routes: relayRoutes,
  templates: {},
});

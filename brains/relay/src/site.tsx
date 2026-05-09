import type { JSX, ComponentChildren } from "preact";
import { createTemplate } from "@brains/plugins";
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
import {
  formatRelayDiagramContent,
  parseRelayDiagramContent,
  relayDiagramBaseContentSchema,
  relayDiagramContentSchema,
  type RelayDiagramContent,
} from "./home-diagram-content";
import { RelayHomeCountsDataSource } from "./home-counts-datasource";

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

const toneClass = (
  tone: RelayDiagramContent["legend"][number]["tone"],
): string => {
  switch (tone) {
    case "capture":
      return "bg-accent";
    case "synthesis":
      return "bg-secondary";
    case "share":
      return "bg-accent-bright";
  }
};

const formatCount = (value: number): string =>
  new Intl.NumberFormat("en", {
    notation: value > 999 ? "compact" : "standard",
  }).format(value);

const pluralizeCount = (
  value: number,
  singular: string,
  plural = `${singular}s`,
): string => `${formatCount(value)} ${value === 1 ? singular : plural}`;

export function RelayDiagramSection({
  eyebrow,
  headline,
  intro,
  primaryCta,
  secondaryCta,
  inputs,
  outputs,
  core,
  legend,
  counts,
}: RelayDiagramContent): JSX.Element {
  const ringStats = [
    {
      key: "captures",
      className: "top-[-10px] left-1/2 -translate-x-1/2",
      label: pluralizeCount(counts.captures, "capture"),
    },
    {
      key: "topics",
      className: "top-1/2 right-[-28px] -translate-y-1/2",
      label: pluralizeCount(counts.topics, "topic"),
    },
    {
      key: "peers",
      className: "bottom-[-10px] left-1/2 -translate-x-1/2",
      label: pluralizeCount(counts.peers, "peer brain"),
    },
    {
      key: "summaries",
      className: "top-1/2 left-[-28px] -translate-y-1/2",
      label: pluralizeCount(counts.summaries, "summary", "summaries"),
    },
  ];

  return (
    <Section className="pt-[150px] pb-section md:pt-[190px]" id="diagram">
      <div className="mx-auto max-w-[1040px] text-center">
        <p className="font-label text-label-sm uppercase tracking-[0.28em] text-accent">
          {eyebrow}
        </p>
        <h1 className="mx-auto mt-7 max-w-[22ch] font-display text-display-lg text-theme">
          {headline}
        </h1>
        <p className="mx-auto mt-7 max-w-[64ch] font-body text-body-lg text-theme-muted">
          {intro}
        </p>
        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <Button href={primaryCta.href} size="lg" variant="primary-strong">
            {primaryCta.label}
          </Button>
          <Button href={secondaryCta.href} size="lg" variant="secondary">
            {secondaryCta.label}
          </Button>
        </div>
      </div>

      <div className="mx-auto mt-20 max-w-[1020px] rounded-[32px] border border-theme-light bg-[radial-gradient(circle_at_1px_1px,rgb(255_255_255_/_0.05)_1px,transparent_0),linear-gradient(180deg,rgb(255_255_255_/_0.02),transparent)] bg-[length:24px_24px,100%_100%] px-6 py-14">
        <div className="grid items-center gap-8 lg:grid-cols-[1fr_1.4fr_1fr]">
          <div className="flex flex-col gap-3.5">
            {inputs.map((node) => (
              <div
                key={`${node.label}-${node.title}`}
                className="rounded-2xl border border-card-panel-border border-l-2 border-l-accent bg-card-panel-bg px-4 py-4 text-left backdrop-blur-sm"
              >
                <p className="font-label text-[10px] uppercase tracking-[0.22em] text-secondary">
                  {node.label}
                </p>
                <h2 className="mt-1.5 font-display text-[18px] font-medium text-theme">
                  {node.title}
                </h2>
                <p className="mt-1 font-body text-[13px] leading-[1.5] text-theme-muted">
                  {node.detail}
                </p>
              </div>
            ))}
          </div>

          <div className="relative mx-auto grid aspect-square w-full max-w-[320px] place-items-center rounded-full bg-[radial-gradient(circle_at_center,rgb(232_119_34_/_0.25),transparent_65%)]">
            <div className="absolute inset-0 rounded-full border border-dashed border-accent/30" />
            <div className="absolute inset-6 animate-spin rounded-full border border-dashed border-secondary/40 [animation-duration:28s]" />
            {ringStats.map((stat) => (
              <span
                key={stat.key}
                className={`absolute whitespace-nowrap rounded-full border border-theme bg-bg px-2.5 py-1 font-label text-[10px] uppercase tracking-[0.18em] text-theme-light ${stat.className}`}
              >
                {stat.label}
              </span>
            ))}
            <div className="relative z-[1] px-6 text-center">
              <p className="font-label text-[10px] uppercase tracking-[0.28em] text-accent">
                {core.eyebrow}
              </p>
              <p className="mt-2 font-display text-[36px] leading-none text-theme">
                {core.name}
              </p>
              <p className="mt-2 font-body text-[13px] text-theme-muted">
                {core.sub}
              </p>
              <p className="mt-4 font-label text-[10px] uppercase tracking-[0.18em] text-theme-light">
                {pluralizeCount(counts.links, "link")} indexed
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3.5">
            {outputs.map((node) => (
              <div
                key={`${node.label}-${node.title}`}
                className="rounded-2xl border border-card-panel-border border-r-2 border-r-secondary bg-card-panel-bg px-4 py-4 text-left backdrop-blur-sm"
              >
                <p className="font-label text-[10px] uppercase tracking-[0.22em] text-secondary">
                  {node.label}
                </p>
                <h2 className="mt-1.5 font-display text-[18px] font-medium text-theme">
                  {node.title}
                </h2>
                <p className="mt-1 font-body text-[13px] leading-[1.5] text-theme-muted">
                  {node.detail}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14 grid gap-4 border-t border-theme-light pt-8 md:grid-cols-3">
          {legend.map((item) => (
            <div key={item.title} className="text-left">
              <h2 className="font-display text-[16px] font-medium text-theme">
                <span
                  className={`mr-2.5 inline-block h-3 w-3 rounded-[3px] align-middle ${toneClass(item.tone)}`}
                />
                {item.title}
              </h2>
              <p className="mt-1.5 font-body text-[13px] leading-[1.6] text-theme-muted">
                {item.text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

const relayDiagramTemplate = createTemplate<RelayDiagramContent>({
  name: "home-diagram",
  description: "Relay homepage system diagram with live entity counts",
  schema: relayDiagramContentSchema,
  formatter: {
    parse: (content: string) =>
      relayDiagramContentSchema.parse({
        ...parseRelayDiagramContent(content),
        counts: {
          captures: 0,
          links: 0,
          topics: 0,
          summaries: 0,
          peers: 0,
        },
      }),
    format: (content: unknown) =>
      formatRelayDiagramContent(relayDiagramBaseContentSchema.parse(content)),
  },
  dataSourceId: "relay-site:home-counts",
  requiredPermission: "public",
  layout: { component: RelayDiagramSection },
});

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
        id: "diagram",
        template: "relay-site:home-diagram",
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
  templates: { "home-diagram": relayDiagramTemplate },
  dataSources: [new RelayHomeCountsDataSource()],
});

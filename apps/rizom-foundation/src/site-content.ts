import { HeroLayout } from "./sections/hero/layout";
import { PullQuoteLayout } from "./sections/pull-quote/layout";
import { ResearchLayout } from "./sections/research/layout";
import { EventsLayout } from "./sections/events/layout";
import { SupportLayout } from "./sections/support/layout";
import { OwnershipLayout } from "./sections/ownership/layout";
import { MissionLayout } from "./sections/mission/layout";
import { EcosystemLayout } from "./sections/ecosystem";

export default {
  namespace: "landing-page",
  sections: {
    hero: {
      description: "Rizom foundation hero — centered editorial manifesto intro",
      title: "Hero Section",
      layout: HeroLayout,
      fields: {
        volumeLabel: { label: "Volume label", type: "string" },
        yearLabel: { label: "Year label", type: "string" },
        metaLabel: { label: "Meta label", type: "string" },
        headline: { label: "Headline", type: "string" },
        headlineTail: { label: "Headline tail", type: "string" },
        tagline: { label: "Tagline", type: "string" },
        subtitle: { label: "Subtitle", type: "string" },
        primaryCtaLabel: { label: "Primary CTA label", type: "string" },
        primaryCtaHref: { label: "Primary CTA href", type: "string" },
        secondaryCtaLabel: { label: "Secondary CTA label", type: "string" },
        secondaryCtaHref: { label: "Secondary CTA href", type: "string" },
        scrollLabel: { label: "Scroll label", type: "string" },
        scrollHref: { label: "Scroll href", type: "string" },
        colophon: {
          label: "Colophon lines",
          type: "array",
          minItems: 1,
          items: { label: "Colophon line", type: "string" },
        },
      },
    },
    "pull-quote": {
      description: "Rizom pull-quote section — centered editorial quote block",
      title: "Pull Quote Section",
      layout: PullQuoteLayout,
      fields: {
        quote: { label: "Quote", type: "string" },
        attribution: { label: "Attribution", type: "string" },
      },
    },
    research: {
      description: "Rizom research section — editorial essay index",
      title: "Research Section",
      layout: ResearchLayout,
      fields: {
        kicker: { label: "Kicker", type: "string" },
        headline: { label: "Headline", type: "string" },
        subhead: { label: "Subhead", type: "string" },
        essays: {
          label: "Essays",
          type: "array",
          minItems: 1,
          items: {
            label: "Essay",
            type: "object",
            fields: {
              num: { label: "Number", type: "string" },
              series: { label: "Series", type: "string" },
              title: { label: "Title", type: "string" },
              teaser: { label: "Teaser", type: "string" },
              href: { label: "Href", type: "string" },
            },
          },
        },
        ctaLabel: { label: "CTA label", type: "string" },
        ctaHref: { label: "CTA href", type: "string" },
      },
    },
    events: {
      description: "Rizom events section — editorial event index",
      title: "Events Section",
      layout: EventsLayout,
      fields: {
        kicker: { label: "Kicker", type: "string" },
        headline: { label: "Headline", type: "string" },
        subhead: { label: "Subhead", type: "string" },
        events: {
          label: "Events",
          type: "array",
          minItems: 1,
          items: {
            label: "Event",
            type: "object",
            fields: {
              num: { label: "Number", type: "string" },
              city: { label: "City", type: "string" },
              description: { label: "Description", type: "string" },
              date: { label: "Date", type: "string" },
              anchor: { label: "Anchor", type: "string" },
              actionLabel: { label: "Action label", type: "string" },
              href: { label: "Href", type: "string" },
            },
          },
        },
        primaryCtaLabel: { label: "Primary CTA label", type: "string" },
        primaryCtaHref: { label: "Primary CTA href", type: "string" },
        secondaryCtaLabel: { label: "Secondary CTA label", type: "string" },
        secondaryCtaHref: { label: "Secondary CTA href", type: "string" },
      },
    },
    support: {
      description: "Rizom support section — two-card funding/support grid",
      title: "Support Section",
      layout: SupportLayout,
      fields: {
        kicker: { label: "Kicker", type: "string" },
        headline: { label: "Headline", type: "string" },
        cards: {
          label: "Cards",
          type: "array",
          length: 2,
          items: {
            label: "Card",
            type: "object",
            fields: {
              tone: {
                label: "Tone",
                type: "enum",
                options: ["amber", "purple"],
              },
              label: { label: "Label", type: "string" },
              headline: { label: "Headline", type: "string" },
              body: { label: "Body", type: "string" },
              linkLabel: { label: "Link label", type: "string" },
              linkHref: { label: "Link href", type: "string" },
            },
          },
        },
      },
    },
    ownership: {
      description: "Rizom ownership section — people and community cards",
      title: "Ownership Section",
      layout: OwnershipLayout,
      fields: {
        badge: { label: "Badge", type: "string" },
        headline: { label: "Headline", type: "string" },
        features: {
          label: "Features",
          type: "array",
          minItems: 1,
          items: {
            label: "Feature",
            type: "object",
            fields: {
              icon: { label: "Icon", type: "string" },
              title: { label: "Title", type: "string" },
              body: { label: "Body", type: "string" },
            },
          },
        },
      },
    },
    mission: {
      description: "Rizom mission section — newsletter and follow CTA",
      title: "Mission Section",
      layout: MissionLayout,
      fields: {
        preamble: { label: "Preamble", type: "string" },
        headlineStart: { label: "Headline start", type: "string" },
        headlineHighlight: { label: "Headline highlight", type: "string" },
        post: { label: "Post", type: "string" },
        primaryCtaLabel: { label: "Primary CTA label", type: "string" },
        primaryCtaHref: { label: "Primary CTA href", type: "string" },
        secondaryCtaLabel: { label: "Secondary CTA label", type: "string" },
        secondaryCtaHref: { label: "Secondary CTA href", type: "string" },
      },
    },
    ecosystem: {
      description: "Rizom ecosystem section — sibling site cards",
      title: "Ecosystem Section",
      layout: EcosystemLayout,
      fields: {
        eyebrow: { label: "Eyebrow", type: "string" },
        headline: { label: "Headline", type: "string" },
        cards: {
          label: "Cards",
          type: "array",
          minItems: 1,
          items: {
            label: "Card",
            type: "object",
            fields: {
              suffix: {
                label: "Suffix",
                type: "enum",
                options: ["ai", "foundation", "work"],
              },
              title: { label: "Title", type: "string" },
              body: { label: "Body", type: "string" },
              linkLabel: { label: "Link label", type: "string" },
              linkHref: { label: "Link href", type: "string" },
            },
          },
        },
      },
    },
  },
};

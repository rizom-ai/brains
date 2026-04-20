import { HeroLayout } from "./sections/hero/layout";
import { ProblemLayout } from "./sections/problem/layout";
import { AnswerLayout } from "./sections/answer/layout";
import { ProductsLayout } from "./sections/products/layout";
import { OwnershipLayout } from "./sections/ownership/layout";
import { QuickstartLayout } from "./sections/quickstart/layout";
import { MissionLayout } from "./sections/mission/layout";
import { EcosystemLayout } from "./sections/ecosystem";

export default {
  namespace: "landing-page",
  sections: {
    hero: {
      description: "Rizom site hero — full-viewport intro with CTA row",
      title: "Hero Section",
      layout: HeroLayout,
      fields: {
        headline: { label: "Headline", type: "string" },
        subhead: { label: "Subhead", type: "string" },
        primaryCtaLabel: { label: "Primary CTA Label", type: "string" },
        primaryCtaHref: { label: "Primary CTA Href", type: "string" },
        secondaryCtaLabel: { label: "Secondary CTA Label", type: "string" },
        secondaryCtaHref: { label: "Secondary CTA Href", type: "string" },
      },
    },
    problem: {
      description: "Rizom problem section — 3-up grid of problem statements",
      title: "Problem Section",
      layout: ProblemLayout,
      fields: {
        cards: {
          label: "Cards",
          type: "array",
          length: 3,
          items: {
            label: "Card",
            type: "object",
            fields: {
              num: { label: "Num", type: "string" },
              title: { label: "Title", type: "string" },
              body: { label: "Body", type: "string" },
            },
          },
        },
      },
    },
    answer: {
      description: "Rizom answer section — centered thesis statement",
      title: "Answer Section",
      layout: AnswerLayout,
      fields: {
        badge: { label: "Badge", type: "string" },
        headline: { label: "Headline", type: "string" },
        subhead: { label: "Subhead", type: "string" },
        scalesHeadline: { label: "Scales Headline", type: "string" },
        scalesSubhead: { label: "Scales Subhead", type: "string" },
      },
    },
    products: {
      description: "Rizom products section — array of product cards",
      title: "Products Section",
      layout: ProductsLayout,
      fields: {
        cards: {
          label: "Cards",
          type: "array",
          minItems: 1,
          items: {
            label: "Card",
            type: "object",
            fields: {
              variant: {
                label: "Variant",
                type: "enum",
                options: ["rover", "relay", "ranger"],
              },
              label: { label: "Label", type: "string" },
              badge: { label: "Badge", type: "string" },
              headline: { label: "Headline", type: "string" },
              description: { label: "Description", type: "string" },
              tagline: {
                label: "Tagline",
                type: "array",
                optional: true,
                minItems: 1,
                items: { label: "Tagline", type: "string" },
              },
              tags: {
                label: "Tags",
                type: "array",
                minItems: 1,
                items: { label: "Tag", type: "string" },
              },
            },
          },
        },
      },
    },
    ownership: {
      description: "Rizom ownership section — feature list with icon markers",
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
    quickstart: {
      description:
        "Quickstart section — install/create/run commands and success lines",
      title: "Quickstart Section",
      layout: QuickstartLayout,
      fields: {
        badge: { label: "Badge", type: "string" },
        headline: { label: "Headline", type: "string" },
        description: { label: "Description", type: "string" },
        installCommand: { label: "Install Command", type: "string" },
        createCommand: { label: "Create Command", type: "string" },
        runCommand: { label: "Run Command", type: "string" },
        okLines: {
          label: "OK Lines",
          type: "array",
          minItems: 1,
          items: { label: "OK Line", type: "string" },
        },
      },
    },
    mission: {
      description: "Mission section — closing statement with CTA row",
      title: "Mission Section",
      layout: MissionLayout,
      fields: {
        preamble: { label: "Preamble", type: "string" },
        headline: { label: "Headline", type: "string" },
        post: { label: "Post", type: "string" },
        primaryCtaLabel: { label: "Primary CTA Label", type: "string" },
        primaryCtaHref: { label: "Primary CTA Href", type: "string" },
        secondaryCtaLabel: { label: "Secondary CTA Label", type: "string" },
        secondaryCtaHref: { label: "Secondary CTA Href", type: "string" },
      },
    },
    ecosystem: {
      description:
        "Rizom ecosystem section — 3-card grid of sibling rizom sites",
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
              linkLabel: { label: "Link Label", type: "string" },
              linkHref: { label: "Link Href", type: "string" },
            },
          },
        },
      },
    },
  },
};

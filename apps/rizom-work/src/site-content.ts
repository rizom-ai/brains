import { WorkHeroLayout } from "./sections/hero/layout";
import { WorkProblemLayout } from "./sections/problem/layout";
import { WorkshopLayout } from "./sections/workshop/layout";
import { PersonasLayout } from "./sections/personas/layout";
import { ProofLayout } from "./sections/proof/layout";
import { BridgeLayout } from "./sections/bridge/layout";
import { CloserLayout } from "./sections/closer/layout";
import { EcosystemLayout } from "./sections/ecosystem";

export default {
  namespace: "landing-page",
  sections: {
    hero: {
      description: "Rizom work hero — split studio intro with diagnostic panel",
      title: "Work Hero Section",
      layout: WorkHeroLayout,
      fields: {
        kicker: { label: "Kicker", type: "string" },
        headline: { label: "Headline", type: "string" },
        subtitle: { label: "Subtitle", type: "string" },
        primaryCtaLabel: { label: "Primary CTA label", type: "string" },
        primaryCtaHref: { label: "Primary CTA href", type: "string" },
        secondaryCtaLabel: { label: "Secondary CTA label", type: "string" },
        secondaryCtaHref: { label: "Secondary CTA href", type: "string" },
        diagnosticTitle: { label: "Diagnostic title", type: "string" },
        diagnosticTag: { label: "Diagnostic tag", type: "string" },
        verdictLabel: { label: "Verdict label", type: "string" },
        verdictValue: { label: "Verdict value", type: "string" },
        findingsLabel: { label: "Findings label", type: "string" },
        findings: {
          label: "Findings",
          type: "array",
          length: 3,
          items: { label: "Finding", type: "string" },
        },
        diagnosticCtaLabel: { label: "Diagnostic CTA label", type: "string" },
        diagnosticCtaHref: { label: "Diagnostic CTA href", type: "string" },
      },
    },
    problem: {
      description:
        "Rizom work problem section — editorial coordination problem statement",
      title: "Work Problem Section",
      layout: WorkProblemLayout,
      fields: {
        kicker: { label: "Kicker", type: "string" },
        headline: { label: "Headline", type: "string" },
        subhead: { label: "Subhead", type: "string" },
      },
    },
    workshop: {
      description: "Rizom workshop section — three-step TMS workshop process",
      title: "Workshop Section",
      layout: WorkshopLayout,
      fields: {
        kicker: { label: "Kicker", type: "string" },
        headline: { label: "Headline", type: "string" },
        intro: { label: "Intro", type: "string" },
        steps: {
          label: "Steps",
          type: "array",
          length: 3,
          items: {
            label: "Step",
            type: "object",
            fields: {
              num: { label: "Number", type: "string" },
              label: { label: "Label", type: "string" },
              title: { label: "Title", type: "string" },
              body: { label: "Body", type: "string" },
            },
          },
        },
        ctaLabel: { label: "CTA label", type: "string" },
        ctaHref: { label: "CTA href", type: "string" },
      },
    },
    personas: {
      description: "Rizom personas section — who the workshop is for",
      title: "Personas Section",
      layout: PersonasLayout,
      fields: {
        kicker: { label: "Kicker", type: "string" },
        headline: { label: "Headline", type: "string" },
        cards: {
          label: "Cards",
          type: "array",
          minItems: 1,
          items: {
            label: "Card",
            type: "object",
            fields: {
              label: { label: "Label", type: "string" },
              quote: { label: "Quote", type: "string" },
              body: { label: "Body", type: "string" },
            },
          },
        },
      },
    },
    proof: {
      description: "Rizom proof section — testimonial and partners",
      title: "Proof Section",
      layout: ProofLayout,
      fields: {
        kicker: { label: "Kicker", type: "string" },
        headline: { label: "Headline", type: "string" },
        quote: { label: "Quote", type: "string" },
        attribution: { label: "Attribution", type: "string" },
        partnersLabel: { label: "Partners label", type: "string" },
        partners: {
          label: "Partners",
          type: "array",
          minItems: 1,
          items: { label: "Partner", type: "string" },
        },
      },
    },
    bridge: {
      description: "Rizom bridge section — connective link to adjacent site",
      title: "Bridge Section",
      layout: BridgeLayout,
      fields: {
        kicker: { label: "Kicker", type: "string" },
        body: { label: "Body", type: "string" },
        linkLabel: { label: "Link label", type: "string" },
        linkHref: { label: "Link href", type: "string" },
      },
    },
    closer: {
      description: "Rizom closer section — final CTA pair",
      title: "Closer Section",
      layout: CloserLayout,
      fields: {
        preamble: { label: "Preamble", type: "string" },
        headline: { label: "Headline", type: "string" },
        primaryCtaLabel: { label: "Primary CTA label", type: "string" },
        primaryCtaHref: { label: "Primary CTA href", type: "string" },
        secondaryCtaLabel: { label: "Secondary CTA label", type: "string" },
        secondaryCtaHref: { label: "Secondary CTA href", type: "string" },
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

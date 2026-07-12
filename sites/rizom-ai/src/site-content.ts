import type {
  SiteContentDefinition,
  SiteContentFieldDefinition,
} from "@rizom/site";
import { AliveLine } from "./shared";
import {
  WorkHeroSection,
  WorkProblemSection,
  WorkWorkshopSection,
  WorkPersonasSection,
  WorkQuotesSection,
  WorkRosterSection,
  WorkCloserSection,
} from "./work";
import {
  FoundationHeroSection,
  FoundationResearchSection,
  FoundationPullquoteSection,
  FoundationChaptersSection,
  FoundationSupportSection,
} from "./foundation";

/** A `{ label, href }` link field, reused by hero/mission CTAs. */
const ctaField = (label: string): SiteContentFieldDefinition => ({
  label,
  type: "object",
  fields: {
    label: { label: "Label", type: "string" },
    href: { label: "Href", type: "string" },
  },
});

/** A `{ label, href }` link-list field, reused by alive / follow lines. */
const linkListField = (label: string): SiteContentFieldDefinition => ({
  label,
  type: "array",
  minItems: 1,
  items: {
    label: "Link",
    type: "object",
    fields: {
      label: { label: "Label", type: "string" },
      href: { label: "Href", type: "string" },
    },
  },
});

/** A journal index-row array (essay / chapter listings). */
const indexItemsField: SiteContentFieldDefinition = {
  label: "Items",
  type: "array",
  minItems: 1,
  items: {
    label: "Item",
    type: "object",
    fields: {
      no: { label: "No", type: "string" },
      kicker: { label: "Kicker", type: "string" },
      title: { label: "Title", type: "string" },
      text: { label: "Text", type: "string" },
      href: { label: "Href", type: "string", optional: true },
      meta: { label: "Meta", type: "string", optional: true },
      metaSub: { label: "Meta Sub", type: "string", optional: true },
    },
  },
};

/**
 * The /work room (previously rizom.work). Namespace "work" → stored as
 * site-content/work/<section>.md, templates resolve as "work:<section>".
 */
export const workContent: SiteContentDefinition = {
  namespace: "work",
  sections: {
    hero: {
      description: "Work room head with the TMS diagnostic panel",
      title: "Hero",
      layout: WorkHeroSection,
      fields: {
        eyebrow: { label: "Eyebrow", type: "string" },
        provenance: { label: "Provenance", type: "string" },
        headline: { label: "Headline", type: "string" },
        standfirst: { label: "Standfirst", type: "string" },
        primaryCta: ctaField("Primary CTA"),
        secondaryCta: ctaField("Secondary CTA"),
        diagnostic: {
          label: "Diagnostic",
          type: "object",
          fields: {
            typeLabel: { label: "Type Label", type: "string" },
            teamType: { label: "Team Type", type: "string" },
            actionsLabel: { label: "Actions Label", type: "string" },
            scoreDimension: { label: "Score Dimension", type: "string" },
            scoreValue: { label: "Score Value", type: "string" },
            scoreMax: { label: "Score Max", type: "string" },
            actions: {
              label: "Actions",
              type: "array",
              minItems: 1,
              items: { label: "Action", type: "string" },
            },
            runLabel: { label: "Run Label", type: "string" },
            runHref: { label: "Run Href", type: "string" },
          },
        },
      },
    },
    problem: {
      description: "The coordination-problem statement",
      title: "Problem",
      layout: WorkProblemSection,
      fields: {
        cap: { label: "Cap", type: "string" },
        capNote: { label: "Cap Note", type: "string", optional: true },
        headline: { label: "Headline", type: "string" },
        intro: { label: "Intro", type: "string" },
      },
    },
    workshop: {
      description: "The workshop — survey, workshop, playbook",
      title: "Workshop",
      layout: WorkWorkshopSection,
      fields: {
        cap: { label: "Cap", type: "string" },
        capNote: { label: "Cap Note", type: "string", optional: true },
        headline: { label: "Headline", type: "string" },
        intro: { label: "Intro", type: "string" },
        steps: {
          label: "Steps",
          type: "array",
          minItems: 1,
          items: {
            label: "Step",
            type: "object",
            fields: {
              title: { label: "Title", type: "string" },
              lead: { label: "Lead", type: "string" },
              text: { label: "Text", type: "string" },
            },
          },
        },
      },
    },
    personas: {
      description: "If this sounds like you — personas",
      title: "Personas",
      layout: WorkPersonasSection,
      fields: {
        cap: { label: "Cap", type: "string" },
        personas: {
          label: "Personas",
          type: "array",
          minItems: 1,
          items: {
            label: "Persona",
            type: "object",
            fields: {
              role: { label: "Role", type: "string" },
              quote: { label: "Quote", type: "string" },
              text: { label: "Text", type: "string" },
            },
          },
        },
      },
    },
    quotes: {
      description: "Client testimonials",
      title: "Quotes",
      layout: WorkQuotesSection,
      fields: {
        cap: { label: "Cap", type: "string" },
        capNote: { label: "Cap Note", type: "string" },
        quotes: {
          label: "Quotes",
          type: "array",
          minItems: 1,
          items: {
            label: "Quote",
            type: "object",
            fields: {
              text: { label: "Text", type: "string" },
              by: { label: "By", type: "string" },
            },
          },
        },
      },
    },
    roster: {
      description: "Team roster",
      title: "Roster",
      layout: WorkRosterSection,
      fields: {
        cap: { label: "Cap", type: "string" },
        capNote: { label: "Cap Note", type: "string" },
        people: {
          label: "People",
          type: "array",
          minItems: 1,
          items: {
            label: "Person",
            type: "object",
            fields: {
              init: { label: "Init", type: "string" },
              name: { label: "Name", type: "string" },
              role: { label: "Role", type: "string" },
            },
          },
        },
      },
    },
    closer: {
      description: "Closing quiz CTA band",
      title: "Closer",
      layout: WorkCloserSection,
      fields: {
        quote: { label: "Quote", type: "string" },
        primaryCta: ctaField("Primary CTA"),
        secondaryCta: ctaField("Secondary CTA"),
      },
    },
  },
};

/**
 * The /foundation room (previously rizom.foundation). Namespace "foundation" →
 * stored as site-content/foundation/<section>.md.
 */
export const foundationContent: SiteContentDefinition = {
  namespace: "foundation",
  sections: {
    hero: {
      description: "Foundation journal masthead",
      title: "Hero",
      layout: FoundationHeroSection,
      fields: {
        volume: { label: "Volume", type: "string" },
        meta: { label: "Meta", type: "string" },
        headline: { label: "Headline", type: "string" },
        standfirst: { label: "Standfirst", type: "string" },
        primaryCta: ctaField("Primary CTA"),
        secondaryCta: ctaField("Secondary CTA"),
      },
    },
    research: {
      description: "Essay index rows",
      title: "Research",
      layout: FoundationResearchSection,
      fields: {
        cap: { label: "Cap", type: "string" },
        capNote: { label: "Cap Note", type: "string" },
        items: indexItemsField,
      },
    },
    pullquote: {
      description: "Pull-quote band",
      title: "Pullquote",
      layout: FoundationPullquoteSection,
      fields: {
        quote: { label: "Quote", type: "string" },
        attribution: { label: "Attribution", type: "string" },
      },
    },
    chapters: {
      description: "City chapter index rows",
      title: "Chapters",
      layout: FoundationChaptersSection,
      fields: {
        cap: { label: "Cap", type: "string" },
        capNote: { label: "Cap Note", type: "string" },
        items: indexItemsField,
      },
    },
    support: {
      description: "Funding options",
      title: "Support",
      layout: FoundationSupportSection,
      fields: {
        cap: { label: "Cap", type: "string" },
        capNote: { label: "Cap Note", type: "string" },
        options: {
          label: "Options",
          type: "array",
          minItems: 1,
          items: {
            label: "Option",
            type: "object",
            fields: {
              kicker: { label: "Kicker", type: "string" },
              amount: { label: "Amount", type: "string" },
              text: { label: "Text", type: "string" },
            },
          },
        },
      },
    },
    follow: {
      description: "Follow-the-research line (shared colophon component)",
      title: "Follow",
      layout: AliveLine,
      fields: {
        claim: { label: "Claim", type: "string" },
        links: linkListField("Links"),
      },
    },
  },
};

// Home is authored schema-first (see ./home `homeSections`); work and
// foundation still use the field DSL until they migrate.
const aiSiteContent: SiteContentDefinition[] = [workContent, foundationContent];

export default aiSiteContent;

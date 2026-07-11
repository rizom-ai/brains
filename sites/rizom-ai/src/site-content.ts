import type {
  SiteContentDefinition,
  SiteContentFieldDefinition,
} from "@rizom/site";
import {
  HomeHeroSection,
  HomeGrowthSection,
  HomeProblemSection,
  HomeYourDataSection,
  HomeQuickstartSection,
  HomeMissionSection,
  HomeFacesSection,
  HomeAliveSection,
} from "./home";

/** A `{ label, href }` link field, reused by hero/mission CTAs. */
const ctaField = (label: string): SiteContentFieldDefinition => ({
  label,
  type: "object",
  fields: {
    label: { label: "Label", type: "string" },
    href: { label: "Href", type: "string" },
  },
});

/** A three-up card with a marker, title, and body — problem / your-data. */
const trioFields = {
  cap: { label: "Cap", type: "string" as const },
  items: {
    label: "Items",
    type: "array" as const,
    length: 3,
    items: {
      label: "Item",
      type: "object" as const,
      fields: {
        marker: { label: "Marker", type: "string" as const },
        title: { label: "Title", type: "string" as const },
        text: { label: "Text", type: "string" as const },
      },
    },
  },
};

/**
 * The platform home page content shapes. The namespace matches the route id
 * ("home"), so each section stores as site-content/home/<section>.md and its
 * template resolves as "home:<section>".
 */
export const homeContent: SiteContentDefinition = {
  namespace: "home",
  sections: {
    hero: {
      description: "Platform homepage hero: kicker, headline, standfirst, CTAs",
      title: "Hero",
      layout: HomeHeroSection,
      fields: {
        kicker: { label: "Kicker", type: "string" },
        headline: { label: "Headline", type: "string" },
        standfirst: { label: "Standfirst", type: "string" },
        primaryCta: ctaField("Primary CTA"),
        secondaryCta: ctaField("Secondary CTA"),
      },
    },
    growth: {
      description: "You → Team → Network growth diagram with caption and note",
      title: "Growth",
      layout: HomeGrowthSection,
      fields: {
        cap: { label: "Cap", type: "string" },
        capNote: { label: "Cap Note", type: "string" },
        note: { label: "Note", type: "string" },
      },
    },
    problem: {
      description: "Why it has to exist — problem trio (large numerals)",
      title: "Problem",
      layout: HomeProblemSection,
      fields: trioFields,
    },
    "your-data": {
      description: "Your data, your rules — ownership trio (mono markers)",
      title: "Your Data",
      layout: HomeYourDataSection,
      fields: trioFields,
    },
    quickstart: {
      description: "Three-command quickstart terminal with a checklist",
      title: "Quickstart",
      layout: HomeQuickstartSection,
      fields: {
        cap: { label: "Cap", type: "string" },
        capNote: { label: "Cap Note", type: "string" },
        lines: {
          label: "Lines",
          type: "array",
          minItems: 1,
          items: {
            label: "Line",
            type: "object",
            fields: {
              kind: {
                label: "Kind",
                type: "enum",
                options: ["comment", "command", "ok"],
              },
              text: { label: "Text", type: "string" },
            },
          },
        },
        checks: {
          label: "Checks",
          type: "array",
          minItems: 1,
          items: { label: "Check", type: "string" },
        },
      },
    },
    mission: {
      description: "Mission band — display-italic statement, sub line, CTAs",
      title: "Mission",
      layout: HomeMissionSection,
      fields: {
        quote: { label: "Quote", type: "string" },
        sub: { label: "Sub", type: "string" },
        primaryCta: ctaField("Primary CTA"),
        secondaryCta: ctaField("Secondary CTA"),
      },
    },
    faces: {
      description: "One practice, three faces — platform / work / foundation",
      title: "Faces",
      layout: HomeFacesSection,
      fields: {
        cap: { label: "Cap", type: "string" },
        faces: {
          label: "Faces",
          type: "array",
          length: 3,
          items: {
            label: "Face",
            type: "object",
            fields: {
              room: {
                label: "Room",
                type: "enum",
                options: ["platform", "work", "foundation"],
              },
              kicker: { label: "Kicker", type: "string" },
              title: { label: "Title", type: "string" },
              go: { label: "Go", type: "string" },
              href: { label: "Href", type: "string" },
            },
          },
        },
      },
    },
    alive: {
      description: "Living-proof colophon — italic claim plus proof links",
      title: "Alive",
      layout: HomeAliveSection,
      fields: {
        claim: { label: "Claim", type: "string" },
        links: {
          label: "Links",
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
        },
      },
    },
  },
};

const aiSiteContent: SiteContentDefinition[] = [homeContent];

export default aiSiteContent;

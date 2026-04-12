import { StructuredContentFormatter } from "@brains/utils";
import {
  FoundationHeroContentSchema,
  type FoundationHeroContent,
} from "./schema";

export const foundationHeroFormatter =
  new StructuredContentFormatter<FoundationHeroContent>(
    FoundationHeroContentSchema,
    {
      title: "Foundation Hero Section",
      mappings: [
        { key: "volumeLabel", label: "Volume label", type: "string" },
        { key: "yearLabel", label: "Year label", type: "string" },
        { key: "metaLabel", label: "Meta label", type: "string" },
        { key: "headline", label: "Headline", type: "string" },
        { key: "headlineTail", label: "Headline tail", type: "string" },
        { key: "tagline", label: "Tagline", type: "string" },
        { key: "subtitle", label: "Subtitle", type: "string" },
        {
          key: "primaryCtaLabel",
          label: "Primary CTA label",
          type: "string",
        },
        {
          key: "primaryCtaHref",
          label: "Primary CTA href",
          type: "string",
        },
        {
          key: "secondaryCtaLabel",
          label: "Secondary CTA label",
          type: "string",
        },
        {
          key: "secondaryCtaHref",
          label: "Secondary CTA href",
          type: "string",
        },
        { key: "scrollLabel", label: "Scroll label", type: "string" },
        { key: "scrollHref", label: "Scroll href", type: "string" },
        {
          key: "colophon",
          label: "Colophon lines",
          type: "array",
          itemType: "string",
        },
      ],
    },
  );

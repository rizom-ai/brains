import { StructuredContentFormatter } from "@brains/utils";
import { CloserContentSchema, type CloserContent } from "./schema";

export const closerFormatter = new StructuredContentFormatter<CloserContent>(
  CloserContentSchema,
  {
    title: "Closer Section",
    mappings: [
      { key: "preamble", label: "Preamble", type: "string" },
      { key: "headlineStart", label: "Headline start", type: "string" },
      {
        key: "headlineEmphasis",
        label: "Headline emphasis",
        type: "string",
      },
      { key: "headlineEnd", label: "Headline end", type: "string" },
      { key: "primaryCtaLabel", label: "Primary CTA label", type: "string" },
      { key: "primaryCtaHref", label: "Primary CTA href", type: "string" },
      {
        key: "secondaryCtaLabel",
        label: "Secondary CTA label",
        type: "string",
      },
      { key: "secondaryCtaHref", label: "Secondary CTA href", type: "string" },
    ],
  },
);

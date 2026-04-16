import { StructuredContentFormatter } from "@brains/utils";
import { MissionContentSchema, type MissionContent } from "./schema";

export const missionFormatter = new StructuredContentFormatter<MissionContent>(
  MissionContentSchema,
  {
    title: "Mission Section",
    mappings: [
      { key: "preamble", label: "Preamble", type: "string" },
      { key: "headlineStart", label: "Headline Start", type: "string" },
      { key: "headlineHighlight", label: "Headline Highlight", type: "string" },
      { key: "post", label: "Post", type: "string" },
      { key: "primaryCtaLabel", label: "Primary CTA Label", type: "string" },
      { key: "primaryCtaHref", label: "Primary CTA Href", type: "string" },
      {
        key: "secondaryCtaLabel",
        label: "Secondary CTA Label",
        type: "string",
      },
      { key: "secondaryCtaHref", label: "Secondary CTA Href", type: "string" },
    ],
  },
);

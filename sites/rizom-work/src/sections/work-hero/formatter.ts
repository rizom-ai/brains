import { StructuredContentFormatter } from "@brains/utils";
import { WorkHeroContentSchema, type WorkHeroContent } from "./schema";

export const workHeroFormatter =
  new StructuredContentFormatter<WorkHeroContent>(WorkHeroContentSchema, {
    title: "Work Hero Section",
    mappings: [
      { key: "kicker", label: "Kicker", type: "string" },
      { key: "headlineStart", label: "Headline start", type: "string" },
      {
        key: "headlineEmphasis",
        label: "Headline emphasis",
        type: "string",
      },
      { key: "headlineEnd", label: "Headline end", type: "string" },
      { key: "subtitle", label: "Subtitle", type: "string" },
      {
        key: "primaryCtaLabel",
        label: "Primary CTA label",
        type: "string",
      },
      { key: "primaryCtaHref", label: "Primary CTA href", type: "string" },
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
      {
        key: "diagnosticTitle",
        label: "Diagnostic title",
        type: "string",
      },
      { key: "diagnosticTag", label: "Diagnostic tag", type: "string" },
      { key: "verdictLabel", label: "Verdict label", type: "string" },
      { key: "verdictValue", label: "Verdict value", type: "string" },
      { key: "findingsLabel", label: "Findings label", type: "string" },
      { key: "findings", label: "Findings", type: "array", itemType: "string" },
      {
        key: "diagnosticCtaLabel",
        label: "Diagnostic CTA label",
        type: "string",
      },
      {
        key: "diagnosticCtaHref",
        label: "Diagnostic CTA href",
        type: "string",
      },
    ],
  });

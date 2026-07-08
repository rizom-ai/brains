import { z } from "@brains/utils/zod";
import { StructuredContentFormatter } from "@brains/content-formatters";

interface CtaLink {
  label: string;
  href: string;
}

interface DiagramNode {
  label: string;
  title: string;
  detail: string;
}

interface DiagramCore {
  eyebrow: string;
  name: string;
  sub: string;
}

interface DiagramLegendItem {
  tone: "capture" | "synthesis" | "share";
  title: string;
  text: string;
}

export interface RelayHomeCounts {
  captures: number;
  links: number;
  topics: number;
  summaries: number;
  peers: number;
}

export interface RelayDiagramBaseContent {
  eyebrow: string;
  headline: string;
  intro: string;
  primaryCta: CtaLink;
  secondaryCta: CtaLink;
  inputs: DiagramNode[];
  outputs: DiagramNode[];
  core: DiagramCore;
  legend: DiagramLegendItem[];
}

export interface RelayDiagramContent extends RelayDiagramBaseContent {
  counts: RelayHomeCounts;
}

const ctaLinkSchema: z.ZodType<CtaLink> = z.object({
  label: z.string(),
  href: z.string(),
});

const diagramNodeSchema: z.ZodType<DiagramNode> = z.object({
  label: z.string(),
  title: z.string(),
  detail: z.string(),
});

const diagramCoreSchema: z.ZodType<DiagramCore> = z.object({
  eyebrow: z.string(),
  name: z.string(),
  sub: z.string(),
});

const diagramLegendItemSchema: z.ZodType<DiagramLegendItem> = z.object({
  tone: z.enum(["capture", "synthesis", "share"]),
  title: z.string(),
  text: z.string(),
});

type RelayHomeCountsSchema = z.ZodObject<{
  captures: z.ZodNumber;
  links: z.ZodNumber;
  topics: z.ZodNumber;
  summaries: z.ZodNumber;
  peers: z.ZodNumber;
}>;

export const relayHomeCountsSchema: RelayHomeCountsSchema = z.object({
  captures: z.number(),
  links: z.number(),
  topics: z.number(),
  summaries: z.number(),
  peers: z.number(),
});

type RelayDiagramBaseContentSchema = z.ZodObject<{
  eyebrow: z.ZodString;
  headline: z.ZodString;
  intro: z.ZodString;
  primaryCta: z.ZodType<CtaLink>;
  secondaryCta: z.ZodType<CtaLink>;
  inputs: z.ZodArray<z.ZodType<DiagramNode>>;
  outputs: z.ZodArray<z.ZodType<DiagramNode>>;
  core: z.ZodType<DiagramCore>;
  legend: z.ZodArray<z.ZodType<DiagramLegendItem>>;
}>;

export const relayDiagramBaseContentSchema: RelayDiagramBaseContentSchema =
  z.object({
    eyebrow: z.string(),
    headline: z.string(),
    intro: z.string(),
    primaryCta: ctaLinkSchema,
    secondaryCta: ctaLinkSchema,
    inputs: z.array(diagramNodeSchema).min(1),
    outputs: z.array(diagramNodeSchema).min(1),
    core: diagramCoreSchema,
    legend: z.array(diagramLegendItemSchema).min(1),
  });

export const relayDiagramContentSchema: ReturnType<
  typeof relayDiagramBaseContentSchema.extend<{
    counts: RelayHomeCountsSchema;
  }>
> = relayDiagramBaseContentSchema.extend({
  counts: relayHomeCountsSchema,
});

export const RELAY_HOME_DIAGRAM_FALLBACK: RelayDiagramBaseContent = {
  eyebrow: "A team brain, diagrammed",
  headline: "Relay sits between the work and the world, and keeps both honest.",
  intro:
    "Capture sources flow into a shared brain; the brain organizes, summarizes, and — selectively — exposes a public surface. Everything else stays private and operational.",
  primaryCta: { label: "See it on a real team", href: "#diagram" },
  secondaryCta: { label: "Read the model", href: "/about" },
  inputs: [
    {
      label: "Source · chat",
      title: "Discord",
      detail: "Shared decisions and field notes captured in flow.",
    },
    {
      label: "Source · agent",
      title: "MCP / CLI",
      detail: "Structured captures from tools and assistants.",
    },
    {
      label: "Source · web",
      title: "Links & docs",
      detail: "External material indexed with sourceable metadata.",
    },
  ],
  outputs: [
    {
      label: "Surface · public",
      title: "Default site",
      detail: "A small, durable face onto what the team currently knows.",
    },
    {
      label: "Surface · agents",
      title: "A2A exchange",
      detail: "Peer brains coordinate over an approved, signed protocol.",
    },
    {
      label: "Surface · query",
      title: "Team Q&A",
      detail: "Ask the brain in chat; answers cite the captures behind them.",
    },
  ],
  core: {
    eyebrow: "The relay",
    name: "brain",
    sub: "capture → topics → summaries",
  },
  legend: [
    {
      tone: "capture",
      title: "Capture",
      text: "Anything the team already does that produces a trace — chat messages, links, deploys, decisions.",
    },
    {
      tone: "synthesis",
      title: "Synthesis",
      text: "The work the brain does on its own time — clustering captures into topics, summaries, and durable memory.",
    },
    {
      tone: "share",
      title: "Share",
      text: "A small, opinionated public surface and an approved agent-to-agent protocol. Most memory stays private.",
    },
  ],
};

export const relayDiagramFormatter: StructuredContentFormatter<RelayDiagramBaseContent> =
  new StructuredContentFormatter(relayDiagramBaseContentSchema, {
    title: "Home diagram",
    mappings: [
      { key: "eyebrow", label: "Eyebrow", type: "string" },
      { key: "headline", label: "Headline", type: "string" },
      { key: "intro", label: "Intro", type: "string" },
      {
        key: "primaryCta",
        label: "Primary CTA",
        type: "object",
        children: [
          { key: "label", label: "Label", type: "string" },
          { key: "href", label: "Href", type: "string" },
        ],
      },
      {
        key: "secondaryCta",
        label: "Secondary CTA",
        type: "object",
        children: [
          { key: "label", label: "Label", type: "string" },
          { key: "href", label: "Href", type: "string" },
        ],
      },
      {
        key: "inputs",
        label: "Inputs",
        type: "array",
        itemType: "object",
        itemMappings: [
          { key: "label", label: "Label", type: "string" },
          { key: "title", label: "Title", type: "string" },
          { key: "detail", label: "Detail", type: "string" },
        ],
      },
      {
        key: "outputs",
        label: "Outputs",
        type: "array",
        itemType: "object",
        itemMappings: [
          { key: "label", label: "Label", type: "string" },
          { key: "title", label: "Title", type: "string" },
          { key: "detail", label: "Detail", type: "string" },
        ],
      },
      {
        key: "core",
        label: "Core",
        type: "object",
        children: [
          { key: "eyebrow", label: "Eyebrow", type: "string" },
          { key: "name", label: "Name", type: "string" },
          { key: "sub", label: "Sub", type: "string" },
        ],
      },
      {
        key: "legend",
        label: "Legend",
        type: "array",
        itemType: "object",
        itemMappings: [
          { key: "tone", label: "Tone", type: "string" },
          { key: "title", label: "Title", type: "string" },
          { key: "text", label: "Text", type: "string" },
        ],
      },
    ],
  });

export function parseRelayDiagramContent(
  content: string,
): RelayDiagramBaseContent {
  return relayDiagramFormatter.parse(content);
}

export function formatRelayDiagramContent(
  content: RelayDiagramBaseContent,
): string {
  return relayDiagramFormatter.format(content);
}

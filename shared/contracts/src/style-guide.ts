import { parseMarkdown } from "@brains/utils/markdown-frontmatter";
import { z } from "@brains/utils/zod";

export type StyleGuideMessagingSchema = z.ZodObject<{
  audiences: z.ZodOptional<z.ZodArray<z.ZodString>>;
  positioning: z.ZodOptional<z.ZodString>;
}>;

export const styleGuideMessagingSchema: StyleGuideMessagingSchema = z.object({
  audiences: z.array(z.string()).optional(),
  positioning: z.string().optional(),
});

export type StyleGuideMessaging = z.output<typeof styleGuideMessagingSchema>;

export type StyleGuideVoiceSchema = z.ZodObject<{
  summary: z.ZodOptional<z.ZodString>;
  traits: z.ZodOptional<z.ZodArray<z.ZodString>>;
  principles: z.ZodOptional<z.ZodArray<z.ZodString>>;
  preferredTerms: z.ZodOptional<z.ZodArray<z.ZodString>>;
  avoid: z.ZodOptional<z.ZodArray<z.ZodString>>;
}>;

export const styleGuideVoiceSchema: StyleGuideVoiceSchema = z.object({
  summary: z.string().optional(),
  traits: z.array(z.string()).optional(),
  principles: z.array(z.string()).optional(),
  preferredTerms: z.array(z.string()).optional(),
  avoid: z.array(z.string()).optional(),
});

export type StyleGuideVoice = z.output<typeof styleGuideVoiceSchema>;

export type StyleGuideVisualSchema = z.ZodObject<{
  artDirection: z.ZodOptional<z.ZodString>;
  palette: z.ZodOptional<z.ZodArray<z.ZodString>>;
  composition: z.ZodOptional<z.ZodString>;
  mood: z.ZodOptional<z.ZodString>;
  preferred: z.ZodOptional<z.ZodArray<z.ZodString>>;
  avoid: z.ZodOptional<z.ZodArray<z.ZodString>>;
}>;

export const styleGuideVisualSchema: StyleGuideVisualSchema = z.object({
  artDirection: z.string().optional(),
  palette: z.array(z.string()).optional(),
  composition: z.string().optional(),
  mood: z.string().optional(),
  preferred: z.array(z.string()).optional(),
  avoid: z.array(z.string()).optional(),
});

export type StyleGuideVisual = z.output<typeof styleGuideVisualSchema>;

export type StyleGuideFrontmatterSchema = z.ZodObject<{
  name: z.ZodString;
  messaging: z.ZodOptional<StyleGuideMessagingSchema>;
  voice: z.ZodOptional<StyleGuideVoiceSchema>;
  visual: z.ZodOptional<StyleGuideVisualSchema>;
}>;

export const styleGuideFrontmatterSchema: StyleGuideFrontmatterSchema =
  z.object({
    name: z.string().describe("Style guide name"),
    messaging: styleGuideMessagingSchema.optional(),
    voice: styleGuideVoiceSchema.optional(),
    visual: styleGuideVisualSchema.optional(),
  });

export type StyleGuideFrontmatter = z.output<
  typeof styleGuideFrontmatterSchema
>;

export interface StyleGuide extends StyleGuideFrontmatter {
  guidance: string;
}

export const DEFAULT_STYLE_GUIDE: StyleGuide = {
  name: "Default style guide",
  guidance: "",
};

export function parseStyleGuideContent(content: string): StyleGuide {
  const parsed = parseMarkdown(content);
  return {
    ...styleGuideFrontmatterSchema.parse(parsed.frontmatter),
    guidance: parsed.content,
  };
}

function addList(lines: string[], label: string, values?: string[]): void {
  if (values && values.length > 0) {
    lines.push(`${label}: ${values.join(", ")}`);
  }
}

function formatVoiceFacet(styleGuide: StyleGuide): string {
  const lines: string[] = [];
  const { messaging, voice } = styleGuide;
  addList(lines, "Audiences", messaging?.audiences);
  if (messaging?.positioning)
    lines.push(`Positioning: ${messaging.positioning}`);
  if (voice?.summary) lines.push(`Voice: ${voice.summary}`);
  addList(lines, "Voice traits", voice?.traits);
  addList(lines, "Voice principles", voice?.principles);
  addList(lines, "Preferred terms", voice?.preferredTerms);
  addList(lines, "Avoid", voice?.avoid);
  return lines.join("\n");
}

function formatVisualFacet(styleGuide: StyleGuide): string {
  const lines: string[] = [];
  const { visual } = styleGuide;
  if (visual?.artDirection) lines.push(`Art direction: ${visual.artDirection}`);
  addList(lines, "Palette", visual?.palette);
  if (visual?.composition) lines.push(`Composition: ${visual.composition}`);
  if (visual?.mood) lines.push(`Mood: ${visual.mood}`);
  addList(lines, "Prefer", visual?.preferred);
  addList(lines, "Avoid", visual?.avoid);
  return lines.join("\n");
}

function appendSharedGuidance(facet: string, guidance: string): string {
  return [facet, guidance].filter(Boolean).join("\n");
}

export interface FormattedStyleGuidance {
  voice?: string | undefined;
  visual?: string | undefined;
}

export function formatStyleGuidance(
  styleGuide: StyleGuide,
  style: "voice" | "visual" | "both",
): FormattedStyleGuidance {
  let voice =
    style === "voice" || style === "both" ? formatVoiceFacet(styleGuide) : "";
  let visual =
    style === "visual" || style === "both" ? formatVisualFacet(styleGuide) : "";

  if (styleGuide.guidance) {
    if (style === "voice" || style === "both") {
      voice = appendSharedGuidance(voice, styleGuide.guidance);
    } else {
      visual = appendSharedGuidance(visual, styleGuide.guidance);
    }
  }

  return {
    ...(voice && { voice }),
    ...(visual && { visual }),
  };
}

export function formatVoiceGuidance(styleGuide: StyleGuide): string {
  return formatStyleGuidance(styleGuide, "voice").voice ?? "";
}

export function formatVisualGuidance(styleGuide: StyleGuide): string {
  return formatStyleGuidance(styleGuide, "visual").visual ?? "";
}

/**
 * Minimal reader for the well-known singleton style-guide entity. Satisfied
 * structurally by the entity service so entity and plugin packages can share
 * the lookup without depending on each other.
 */
/**
 * A stored record of a type whose fields are frontmatter: as an entity
 * plugin class reads it, the content carries the frontmatter; as a declared
 * type reads it, the content is the body and the frontmatter its metadata.
 */
export interface FrontmatterRecord {
  readonly content: string;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

/** The record's frontmatter fields and its body, whichever way it was read. */
export function frontmatterRecordFields(record: FrontmatterRecord): {
  fields: unknown;
  body: string;
} {
  const parsed = parseMarkdown(record.content);
  return Object.keys(parsed.frontmatter).length > 0
    ? { fields: parsed.frontmatter, body: parsed.content }
    : { fields: record.metadata ?? {}, body: parsed.content };
}

/** The style guide a stored style-guide record holds. */
export function styleGuideFromRecord(record: FrontmatterRecord): StyleGuide {
  const { fields, body } = frontmatterRecordFields(record);
  return {
    ...styleGuideFrontmatterSchema.parse(fields),
    guidance: body,
  };
}

export interface StyleGuideEntityReader {
  getEntity(request: {
    entityType: string;
    id: string;
  }): Promise<({ id: string } & FrontmatterRecord) | null>;
}

export async function fetchStyleGuide(
  reader: StyleGuideEntityReader,
): Promise<StyleGuide> {
  const entity = await reader.getEntity({
    entityType: "style-guide",
    id: "style-guide",
  });
  return entity?.id === "style-guide"
    ? styleGuideFromRecord(entity)
    : DEFAULT_STYLE_GUIDE;
}

export async function fetchVoiceGuidance(
  reader: StyleGuideEntityReader,
): Promise<string> {
  return formatVoiceGuidance(await fetchStyleGuide(reader));
}

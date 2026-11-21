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
 * A stored record as a reader sees it: its fields are its metadata, which
 * keeps one shape whatever form its file is in, and its content is its body,
 * or its whole document when it was read as stored
 * (docs/plans/one-stored-form.md).
 */
export interface FrontmatterRecord {
  readonly content: string;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

/** A record's body: its content without the header it carries when read as stored. */
export function recordBody(record: Pick<FrontmatterRecord, "content">): string {
  return parseMarkdown(record.content).content;
}

/**
 * A record's fields and its body. Its fields are its metadata, which keeps
 * one shape whatever form its file is in, so a reader never depends on how
 * the file lays them out. Only a record with no metadata at all (a document
 * decoded before it is stored, or a row from before its type was declared)
 * is read from the header its content carries.
 */
export function recordFields(record: FrontmatterRecord): {
  fields: Readonly<Record<string, unknown>>;
  body: string;
} {
  const parsed = parseMarkdown(record.content);
  const metadata = record.metadata ?? {};
  return {
    fields: Object.keys(metadata).length > 0 ? metadata : parsed.frontmatter,
    body: parsed.content,
  };
}

/**
 * A document read as stored (`source: true`), split into its header and its
 * body. Only for the type's own package, or a type whose header is part of
 * its contract: every other reader reads a record's fields from its metadata.
 */
export function storedDocumentParts(content: string): {
  header: Record<string, unknown>;
  body: string;
} {
  const parsed = parseMarkdown(content);
  return { header: parsed.frontmatter, body: parsed.content };
}

/** The style guide a stored style-guide record holds. */
export function styleGuideFromRecord(record: FrontmatterRecord): StyleGuide {
  const { fields, body } = recordFields(record);
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

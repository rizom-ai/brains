import { parseMarkdown } from "@brains/utils/markdown";
import { z } from "@brains/utils/zod";

export interface StyleGuideMessaging {
  audiences?: string[] | undefined;
  positioning?: string | undefined;
}

export interface StyleGuideVoice {
  summary?: string | undefined;
  traits?: string[] | undefined;
  principles?: string[] | undefined;
  preferredTerms?: string[] | undefined;
  avoid?: string[] | undefined;
}

export interface StyleGuideVisual {
  artDirection?: string | undefined;
  palette?: string[] | undefined;
  composition?: string | undefined;
  mood?: string | undefined;
  preferred?: string[] | undefined;
  avoid?: string[] | undefined;
}

export interface StyleGuideFrontmatter {
  name: string;
  messaging?: StyleGuideMessaging | undefined;
  voice?: StyleGuideVoice | undefined;
  visual?: StyleGuideVisual | undefined;
}

export interface StyleGuide extends StyleGuideFrontmatter {
  guidance: string;
}

export type StyleGuideMessagingSchema = z.ZodObject<{
  audiences: z.ZodOptional<z.ZodArray<z.ZodString>>;
  positioning: z.ZodOptional<z.ZodString>;
}>;

export const styleGuideMessagingSchema: StyleGuideMessagingSchema = z.object({
  audiences: z.array(z.string()).optional(),
  positioning: z.string().optional(),
});

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
export interface StyleGuideEntityReader {
  getEntity(request: { entityType: string; id: string }): Promise<{
    id: string;
    content: string;
    metadata?: unknown;
  } | null>;
}

/**
 * Build the style guide from a stored entity.
 *
 * The style guide lives in the entity's metadata, decoded from markdown
 * frontmatter on import; `content` is the free-text guidance body. An
 * entity whose metadata does not satisfy the schema — including one
 * written before the style guide became a declarative entity, where the
 * data was still embedded in `content` — degrades to the default rather
 * than erroring. Such rows repopulate on the next directory-sync import,
 * since the markdown file on disk is the source of truth.
 */
export function styleGuideFromEntity(
  entity: { id: string; content: string; metadata?: unknown } | null,
): StyleGuide {
  if (entity?.id !== "style-guide") return DEFAULT_STYLE_GUIDE;
  const parsed = styleGuideFrontmatterSchema.safeParse(entity.metadata);
  return parsed.success
    ? { ...parsed.data, guidance: entity.content }
    : DEFAULT_STYLE_GUIDE;
}

export async function fetchStyleGuide(
  reader: StyleGuideEntityReader,
): Promise<StyleGuide> {
  return styleGuideFromEntity(
    await reader.getEntity({ entityType: "style-guide", id: "style-guide" }),
  );
}

export async function fetchVoiceGuidance(
  reader: StyleGuideEntityReader,
): Promise<string> {
  return formatVoiceGuidance(await fetchStyleGuide(reader));
}

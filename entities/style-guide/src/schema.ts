import { baseEntityParserSchema } from "@brains/plugins";
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

export type StyleGuideMetadata = Record<string, never>;

export const styleGuideMetadataSchema: z.ZodType<StyleGuideMetadata> = z.object(
  {},
);

export const styleGuideEntitySchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    id: z.ZodLiteral<"style-guide">;
    entityType: z.ZodLiteral<"style-guide">;
    metadata: z.ZodType<StyleGuideMetadata>;
  }>
> = baseEntityParserSchema.extend({
  id: z.literal("style-guide"),
  entityType: z.literal("style-guide"),
  metadata: styleGuideMetadataSchema,
});

export type StyleGuideEntity = z.output<typeof styleGuideEntitySchema>;

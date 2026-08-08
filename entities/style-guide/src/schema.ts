import {
  styleGuideFrontmatterSchema,
  styleGuideMessagingSchema,
  styleGuideVisualSchema,
  styleGuideVoiceSchema,
} from "@brains/contracts";
import type {
  StyleGuide,
  StyleGuideFrontmatter,
  StyleGuideMessaging,
  StyleGuideVisual,
  StyleGuideVoice,
} from "@brains/contracts";
import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";

export {
  styleGuideFrontmatterSchema,
  styleGuideMessagingSchema,
  styleGuideVisualSchema,
  styleGuideVoiceSchema,
};
export type {
  StyleGuide,
  StyleGuideFrontmatter,
  StyleGuideMessaging,
  StyleGuideVisual,
  StyleGuideVoice,
};

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

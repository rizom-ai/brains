import { baseEntitySchema } from "@brains/plugins";
import { z } from "@brains/utils";

export const playbookStatusSchema = z.enum(["draft", "active", "archived"]);
export const playbookAudienceSchema = z.enum(["anchor", "trusted", "public"]);
export const playbookCompletionModeSchema = z.enum([
  "agent-confirmed",
  "manual",
]);

export const playbookFrontmatterSchema = z.object({
  title: z.string(),
  status: playbookStatusSchema.default("active"),
  audience: playbookAudienceSchema.default("anchor"),
  trigger: z.string().optional(),
  completionMode: playbookCompletionModeSchema.default("agent-confirmed"),
});

export const playbookMetadataSchema = z.object({
  title: z.string(),
  status: playbookStatusSchema,
  audience: playbookAudienceSchema,
  trigger: z.string().optional(),
  completionMode: playbookCompletionModeSchema,
});

export const playbookSchema = baseEntitySchema.extend({
  entityType: z.literal("playbook"),
  metadata: playbookMetadataSchema,
});

export const playbookConfigSchema = z.object({});

export type PlaybookStatus = z.infer<typeof playbookStatusSchema>;
export type PlaybookAudience = z.infer<typeof playbookAudienceSchema>;
export type PlaybookCompletionMode = z.infer<
  typeof playbookCompletionModeSchema
>;
export type PlaybookFrontmatter = z.infer<typeof playbookFrontmatterSchema>;
export type PlaybookMetadata = z.infer<typeof playbookMetadataSchema>;
export type PlaybookEntity = z.infer<typeof playbookSchema>;
export type PlaybookConfig = z.infer<typeof playbookConfigSchema>;

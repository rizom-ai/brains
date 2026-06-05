import { baseEntitySchema } from "@brains/plugins";
import { z } from "@brains/utils";

export const playbookStatusSchema = z.enum(["draft", "active", "archived"]);
export const playbookAudienceSchema = z.enum(["anchor", "trusted", "public"]);
export const playbookCompletionModeSchema = z.enum([
  "agent-confirmed",
  "manual",
]);

export const playbookExpectedEntitySchema = z.object({
  entityType: z.string().min(1),
  purpose: z.string().min(1),
  required: z.boolean().default(false),
});

export const playbookTransitionSchema = z.object({
  event: z.string().min(1),
  target: z.string().min(1),
  description: z.string().optional(),
});

export const playbookStateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  instructions: z.array(z.string().min(1)).default([]),
  completionCriteria: z.array(z.string().min(1)).default([]),
  expectedEntities: z.array(playbookExpectedEntitySchema).default([]),
  transitions: z.array(playbookTransitionSchema).default([]),
});

export const playbookBodySchema = z.object({
  purpose: z.string().min(1),
  operatingRules: z.array(z.string().min(1)).default([]),
  initialState: z.string().min(1),
  states: z.array(playbookStateSchema).min(1),
  finalStates: z.array(z.string().min(1)).min(1),
  nextPrompts: z.array(z.string().min(1)).default([]),
});

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
export type PlaybookExpectedEntity = z.infer<
  typeof playbookExpectedEntitySchema
>;
export type PlaybookTransition = z.infer<typeof playbookTransitionSchema>;
export type PlaybookState = z.infer<typeof playbookStateSchema>;
export type PlaybookBody = z.infer<typeof playbookBodySchema>;
export type PlaybookFrontmatter = z.infer<typeof playbookFrontmatterSchema>;
export type PlaybookMetadata = z.infer<typeof playbookMetadataSchema>;
export type PlaybookEntity = z.infer<typeof playbookSchema>;
export type PlaybookConfig = z.infer<typeof playbookConfigSchema>;

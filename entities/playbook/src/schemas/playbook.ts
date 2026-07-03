import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod-v4";

export type PlaybookStatus = "draft" | "active" | "archived";
export type PlaybookAudience = "anchor" | "trusted" | "public";
export type PlaybookCompletionMode = "agent-confirmed" | "manual";

export const playbookStatusSchema: z.ZodType<PlaybookStatus, PlaybookStatus> =
  z.enum(["draft", "active", "archived"]);
export const playbookAudienceSchema: z.ZodType<
  PlaybookAudience,
  PlaybookAudience
> = z.enum(["anchor", "trusted", "public"]);
export const playbookCompletionModeSchema: z.ZodType<
  PlaybookCompletionMode,
  PlaybookCompletionMode
> = z.enum(["agent-confirmed", "manual"]);

const playbookStatusParserSchema: z.ZodType<PlaybookStatus, PlaybookStatus> =
  z.enum(["draft", "active", "archived"]);
const playbookAudienceParserSchema: z.ZodType<
  PlaybookAudience,
  PlaybookAudience
> = z.enum(["anchor", "trusted", "public"]);
const playbookCompletionModeParserSchema: z.ZodType<
  PlaybookCompletionMode,
  PlaybookCompletionMode
> = z.enum(["agent-confirmed", "manual"]);

const optionalTextSchema: z.ZodType<string | undefined, unknown> = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0 ? undefined : value,
  z.string().min(1).optional(),
);

const optionalTextParserSchema: z.ZodType<string | undefined, unknown> =
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim().length === 0
        ? undefined
        : value,
    z.string().min(1).optional(),
  );

export interface PlaybookTransition {
  event: string;
  target: string;
  operatorAction?: boolean | undefined;
  label?: string | undefined;
  description?: string | undefined;
  operatorDescription?: string | undefined;
}

export const playbookTransitionSchema: z.ZodType<PlaybookTransition> = z.object(
  {
    event: z.string().min(1),
    target: z.string().min(1),
    operatorAction: z.boolean().optional(),
    label: optionalTextParserSchema,
    description: optionalTextParserSchema,
    operatorDescription: optionalTextParserSchema,
  },
);

export interface PlaybookState {
  id: string;
  title: string;
  prompt?: string | undefined;
  requiredDetails: string[];
  instructions: string[];
  doneWhen: string[];
  transitions: PlaybookTransition[];
}

export const playbookStateSchema: z.ZodType<PlaybookState> = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  prompt: optionalTextParserSchema,
  requiredDetails: z.array(z.string().min(1)).default([]),
  instructions: z.array(z.string().min(1)).default([]),
  doneWhen: z.array(z.string().min(1)).default([]),
  transitions: z.array(playbookTransitionSchema).default([]),
});

export interface PlaybookBody {
  purpose: string;
  operatingRules: string[];
  initialState: string;
  states: PlaybookState[];
  finalStates: string[];
  nextPrompts: string[];
}

export const playbookBodySchema: z.ZodType<PlaybookBody> = z.object({
  purpose: z.string().min(1),
  operatingRules: z.array(z.string().min(1)).default([]),
  initialState: z.string().min(1),
  states: z.array(playbookStateSchema).min(1),
  finalStates: z.array(z.string().min(1)).min(1),
  nextPrompts: z.array(z.string().min(1)).default([]),
});

export interface PlaybookFrontmatter {
  [key: string]: unknown;
  title: string;
  status: PlaybookStatus;
  audience: PlaybookAudience;
  trigger?: string | undefined;
  lifecycle?: string | undefined;
  once?: boolean | undefined;
  starterText?: string | undefined;
  description?: string | undefined;
  starterPrompt?: string | undefined;
  completionMode: PlaybookCompletionMode;
}

type PlaybookFrontmatterSchema = z.ZodObject<{
  title: z.ZodString;
  status: z.ZodDefault<z.ZodType<PlaybookStatus, PlaybookStatus>>;
  audience: z.ZodDefault<z.ZodType<PlaybookAudience, PlaybookAudience>>;
  trigger: z.ZodOptional<z.ZodType<string | undefined, unknown>>;
  lifecycle: z.ZodOptional<z.ZodType<string | undefined, unknown>>;
  once: z.ZodOptional<z.ZodBoolean>;
  starterText: z.ZodOptional<z.ZodType<string | undefined, unknown>>;
  description: z.ZodOptional<z.ZodType<string | undefined, unknown>>;
  starterPrompt: z.ZodOptional<z.ZodType<string | undefined, unknown>>;
  completionMode: z.ZodDefault<
    z.ZodType<PlaybookCompletionMode, PlaybookCompletionMode>
  >;
}>;

export const playbookFrontmatterSchema: PlaybookFrontmatterSchema = z.object({
  title: z.string(),
  status: playbookStatusSchema.default("active"),
  audience: playbookAudienceSchema.default("anchor"),
  trigger: optionalTextSchema.optional(),
  lifecycle: optionalTextSchema.optional(),
  once: z.boolean().optional(),
  starterText: optionalTextSchema.optional(),
  description: optionalTextSchema.optional(),
  starterPrompt: optionalTextSchema.optional(),
  completionMode: playbookCompletionModeSchema.default("agent-confirmed"),
});

export interface PlaybookMetadata {
  [key: string]: unknown;
  title: string;
  status: PlaybookStatus;
  audience: PlaybookAudience;
  trigger?: string | undefined;
  lifecycle?: string | undefined;
  once?: boolean | undefined;
  starterText?: string | undefined;
  description?: string | undefined;
  starterPrompt?: string | undefined;
  completionMode: PlaybookCompletionMode;
}

type PlaybookMetadataSchema = z.ZodObject<{
  title: z.ZodString;
  status: z.ZodType<PlaybookStatus, PlaybookStatus>;
  audience: z.ZodType<PlaybookAudience, PlaybookAudience>;
  trigger: z.ZodOptional<z.ZodType<string | undefined, unknown>>;
  lifecycle: z.ZodOptional<z.ZodType<string | undefined, unknown>>;
  once: z.ZodOptional<z.ZodBoolean>;
  starterText: z.ZodOptional<z.ZodType<string | undefined, unknown>>;
  description: z.ZodOptional<z.ZodType<string | undefined, unknown>>;
  starterPrompt: z.ZodOptional<z.ZodType<string | undefined, unknown>>;
  completionMode: z.ZodType<PlaybookCompletionMode, PlaybookCompletionMode>;
}>;

export const playbookMetadataSchema: PlaybookMetadataSchema = z.object({
  title: z.string(),
  status: playbookStatusSchema,
  audience: playbookAudienceSchema,
  trigger: optionalTextSchema.optional(),
  lifecycle: optionalTextSchema.optional(),
  once: z.boolean().optional(),
  starterText: optionalTextSchema.optional(),
  description: optionalTextSchema.optional(),
  starterPrompt: optionalTextSchema.optional(),
  completionMode: playbookCompletionModeSchema,
});

const playbookEntityMetadataParserSchema: PlaybookMetadataSchema = z.object({
  title: z.string(),
  status: playbookStatusParserSchema,
  audience: playbookAudienceParserSchema,
  trigger: optionalTextParserSchema.optional(),
  lifecycle: optionalTextParserSchema.optional(),
  once: z.boolean().optional(),
  starterText: optionalTextParserSchema.optional(),
  description: optionalTextParserSchema.optional(),
  starterPrompt: optionalTextParserSchema.optional(),
  completionMode: playbookCompletionModeParserSchema,
});

export const playbookSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"playbook">;
    metadata: PlaybookMetadataSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("playbook"),
  metadata: playbookEntityMetadataParserSchema,
});

export type PlaybookEntity = z.output<typeof playbookSchema>;

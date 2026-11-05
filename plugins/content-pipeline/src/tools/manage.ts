import type {
  Tool,
  ToolContext,
  ToolResponse,
  ServicePluginContext,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { ProviderRegistry } from "../provider-registry";
import type { PublicationQueueService } from "../publication-queue-service";
import type { QueueManager } from "../queue-manager";
import {
  handleQueueAction,
  queueActionSchema,
  queueOutputSchema,
  type QueueMutationService,
} from "./queue";
import {
  handlePublishAction,
  publishOutputSchema,
  type PublishInput,
  type PublishOutput,
} from "./publish";
import {
  PublishExecutor,
  type PublishEntityExecutor,
} from "../publish-executor";

export const publishingManageInputSchema: z.ZodObject<{
  action: z.ZodEnum<{
    "queue-list": "queue-list";
    "queue-add": "queue-add";
    "queue-remove": "queue-remove";
    "queue-reorder": "queue-reorder";
    publish: "publish";
  }>;
  entityType: z.ZodOptional<z.ZodString>;
  entityId: z.ZodOptional<z.ZodString>;
  position: z.ZodOptional<z.ZodNumber>;
  id: z.ZodOptional<z.ZodString>;
  slug: z.ZodOptional<z.ZodString>;
  confirmed: z.ZodOptional<z.ZodBoolean>;
  confirmationToken: z.ZodOptional<z.ZodString>;
  contentHash: z.ZodOptional<z.ZodString>;
  expiresAt: z.ZodOptional<z.ZodString>;
}> = z.object({
  action: z
    .enum([
      "queue-list",
      "queue-add",
      "queue-remove",
      "queue-reorder",
      "publish",
    ])
    .describe("Publishing action to perform"),
  entityType: z
    .string()
    .optional()
    .describe(
      "Entity type for queue operations or direct publish, such as social-post, post, newsletter, or deck",
    ),
  entityId: z
    .string()
    .optional()
    .describe("Entity ID for queue add/remove/reorder operations"),
  position: z
    .number()
    .optional()
    .describe("New 1-based position for queue-reorder"),
  id: z.string().optional().describe("Entity ID to publish"),
  slug: z.string().optional().describe("Entity slug to publish"),
  confirmed: z.boolean().optional(),
  confirmationToken: z.string().optional(),
  contentHash: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
});

export type PublishingManageSchemaInput = z.output<
  typeof publishingManageInputSchema
>;
export type PublishingManageActionName = PublishingManageSchemaInput["action"];

type PublishActionSchema = z.ZodObject<{
  action: z.ZodLiteral<"publish">;
  entityType: z.ZodString;
  id: z.ZodOptional<z.ZodString>;
  slug: z.ZodOptional<z.ZodString>;
  confirmed: z.ZodOptional<z.ZodBoolean>;
  confirmationToken: z.ZodOptional<z.ZodString>;
  contentHash: z.ZodOptional<z.ZodString>;
  expiresAt: z.ZodOptional<z.ZodString>;
}>;

type PublishingManageActionSchema = z.ZodDiscriminatedUnion<
  [...(typeof queueActionSchema)["options"], PublishActionSchema]
>;

const publishActionSchema: PublishActionSchema = z.object({
  action: z.literal("publish"),
  entityType: z.string().min(1),
  id: z.string().optional(),
  slug: z.string().optional(),
  confirmed: z.boolean().optional(),
  confirmationToken: z.string().optional(),
  contentHash: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
});

const publishingManageActionSchema: PublishingManageActionSchema =
  z.discriminatedUnion("action", [
    ...queueActionSchema.options,
    publishActionSchema,
  ]);

export type PublishingManageInput = z.output<
  typeof publishingManageActionSchema
>;

export const publishingManageOutputSchema: z.ZodUnion<
  [typeof queueOutputSchema, typeof publishOutputSchema]
> = z.union([queueOutputSchema, publishOutputSchema]);

export type PublishingManageOutput = z.output<
  typeof publishingManageOutputSchema
>;

export interface PublishingManageServices {
  queueManager: QueueManager;
  providerRegistry: ProviderRegistry;
  publicationQueueService?: PublicationQueueService | undefined;
  publishExecutor?: PublishEntityExecutor | undefined;
}

export function createPublishingManageTool(
  context: ServicePluginContext,
  services: PublishingManageServices,
): Tool<ToolResponse> {
  const queueMutations: QueueMutationService =
    services.publicationQueueService ?? services.queueManager;
  const publishExecutor =
    services.publishExecutor ??
    new PublishExecutor({
      context,
      providerRegistry: services.providerRegistry,
    });

  return {
    name: "publishing_manage",
    description:
      "Manage publishing with an action discriminator. Use action=queue-list to inspect the publish queue; action=queue-add to queue an entity for publication; action=queue-remove to remove a queued entity; action=queue-reorder to change queue order; action=publish to publish one entity directly to its platform (e.g. LinkedIn, Buttondown). Direct publish requests confirmation inside this tool: when the user asks to publish, call action=publish without confirmed instead of asking for plain-text confirmation. Follow-ups like 'publish it now' target the entity just read, generated, or updated in the conversation, including a post just changed to draft. Missing publish assets such as generated OG images are reconciled during publishing; there is no separate reconciliation tool to call.",
    inputSchema: publishingManageInputSchema.shape,
    outputSchema: publishingManageOutputSchema,
    visibility: "admin",
    sideEffects: "external",
    handler: async (rawInput, toolContext): Promise<ToolResponse> => {
      const parsed = publishingManageActionSchema.safeParse(rawInput);
      if (!parsed.success) {
        return {
          success: false,
          error: `Invalid input: ${parsed.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join(", ")}`,
        };
      }

      return handlePublishingManageAction({
        context,
        queueManager: services.queueManager,
        queueMutations,
        publishExecutor,
        input: parsed.data,
        toolContext,
      });
    },
  };
}

async function handlePublishingManageAction(input: {
  context: ServicePluginContext;
  queueManager: QueueManager;
  queueMutations: QueueMutationService;
  publishExecutor: PublishEntityExecutor;
  input: PublishingManageInput;
  toolContext: ToolContext;
}): Promise<ToolResponse> {
  if (input.input.action !== "publish") {
    return handleQueueAction(
      input.context,
      input.queueManager,
      input.queueMutations,
      input.input,
      input.toolContext,
    );
  }

  return addCanonicalPublishAction(
    await handlePublishAction({
      context: input.context,
      executor: input.publishExecutor,
      toolName: "publishing_manage",
      rawInput: buildPublishInput(input.input),
      toolContext: input.toolContext,
    }),
  );
}

function buildPublishInput(
  input: Extract<PublishingManageInput, { action: "publish" }>,
): PublishInput {
  const publishInput: PublishInput = { entityType: input.entityType };
  if (input.id !== undefined) publishInput.id = input.id;
  if (input.slug !== undefined) publishInput.slug = input.slug;
  if (input.confirmed !== undefined) publishInput.confirmed = input.confirmed;
  if (input.confirmationToken !== undefined) {
    publishInput.confirmationToken = input.confirmationToken;
  }
  if (input.contentHash !== undefined) {
    publishInput.contentHash = input.contentHash;
  }
  if (input.expiresAt !== undefined) publishInput.expiresAt = input.expiresAt;
  return publishInput;
}

function addCanonicalPublishAction(response: PublishOutput): ToolResponse {
  if (!("needsConfirmation" in response)) {
    return response;
  }

  return {
    ...response,
    toolName: "publishing_manage",
    args: {
      action: "publish",
      ...response.args,
    },
  };
}

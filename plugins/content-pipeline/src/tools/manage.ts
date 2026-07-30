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
  queueOutputSchema,
  type QueueInput,
  type QueueMutationService,
  type QueueOutput,
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

export type PublishingManageActionName =
  "queue-list" | "queue-add" | "queue-remove" | "queue-reorder" | "publish";

export interface PublishingManageSchemaInput {
  action: PublishingManageActionName;
  entityType?: string | undefined;
  entityId?: string | undefined;
  position?: number | undefined;
  id?: string | undefined;
  slug?: string | undefined;
  confirmed?: boolean | undefined;
  confirmationToken?: string | undefined;
  contentHash?: string | undefined;
  expiresAt?: string | undefined;
}

export type PublishingManageInput =
  | { action: "queue-list"; entityType?: string | undefined }
  | { action: "queue-add"; entityType: string; entityId: string }
  | { action: "queue-remove"; entityType: string; entityId: string }
  | {
      action: "queue-reorder";
      entityType: string;
      entityId: string;
      position: number;
    }
  | {
      action: "publish";
      entityType: string;
      id?: string | undefined;
      slug?: string | undefined;
      confirmed?: boolean | undefined;
      confirmationToken?: string | undefined;
      contentHash?: string | undefined;
      expiresAt?: string | undefined;
    };

export type PublishingManageOutput = QueueOutput | PublishOutput;

export const publishingManageInputSchema: z.ZodObject<z.ZodRawShape> &
  z.ZodType<PublishingManageSchemaInput, PublishingManageSchemaInput> =
  z.object({
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

const publishingManageActionSchema: z.ZodType<
  PublishingManageInput,
  PublishingManageInput
> = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("queue-list"),
    entityType: z.string().optional(),
  }),
  z.object({
    action: z.literal("queue-add"),
    entityType: z.string().min(1),
    entityId: z.string().min(1),
  }),
  z.object({
    action: z.literal("queue-remove"),
    entityType: z.string().min(1),
    entityId: z.string().min(1),
  }),
  z.object({
    action: z.literal("queue-reorder"),
    entityType: z.string().min(1),
    entityId: z.string().min(1),
    position: z.number().int().positive(),
  }),
  z.object({
    action: z.literal("publish"),
    entityType: z.string().min(1),
    id: z.string().optional(),
    slug: z.string().optional(),
    confirmed: z.boolean().optional(),
    confirmationToken: z.string().optional(),
    contentHash: z.string().optional(),
    expiresAt: z.string().datetime().optional(),
  }),
]);

export const publishingManageOutputSchema: z.ZodType<
  PublishingManageOutput,
  PublishingManageOutput
> = z.union([queueOutputSchema, publishOutputSchema]);

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
      "Manage publishing with an action discriminator. Use action=queue-list to inspect the publish queue; action=queue-add to queue an entity for publication; action=queue-remove to remove a queued entity; action=queue-reorder to change queue order; action=publish to publish one entity directly. Direct publish requests confirmation inside this tool; call action=publish without confirmed first, then retry with the returned confirmation args.",
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
  switch (input.input.action) {
    case "queue-list":
      return handleQueue(input, {
        action: "list",
        entityType: input.input.entityType,
      });
    case "queue-add":
      return handleQueue(input, {
        action: "add",
        entityType: input.input.entityType,
        entityId: input.input.entityId,
      });
    case "queue-remove":
      return handleQueue(input, {
        action: "remove",
        entityType: input.input.entityType,
        entityId: input.input.entityId,
      });
    case "queue-reorder":
      return handleQueue(input, {
        action: "reorder",
        entityType: input.input.entityType,
        entityId: input.input.entityId,
        position: input.input.position,
      });
    case "publish":
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
}

function handleQueue(
  input: {
    context: ServicePluginContext;
    queueManager: QueueManager;
    queueMutations: QueueMutationService;
    toolContext: ToolContext;
  },
  queueInput: QueueInput,
): Promise<ToolResponse> {
  return handleQueueAction(
    input.context,
    input.queueManager,
    input.queueMutations,
    queueInput,
    input.toolContext,
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

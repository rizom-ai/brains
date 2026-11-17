import {
  generateFromSourcesContract,
  type GenerateFromSourcesRequest,
  type GenerateFromSourcesResponse,
} from "@brains/contracts";
import type { Tool, ToolContext } from "@brains/mcp-service";
import { answerContract, type IMessageBus } from "@brains/messaging-service";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";

/** What `system_generate` answers, as far as this contract reports it. */
const toolAnswerSchema = z.union([
  z.object({
    needsConfirmation: z.literal(true),
    summary: z.string(),
    completionSummary: z.string().optional(),
    preview: z.string(),
    args: z.record(z.string(), z.unknown()),
  }),
  z.object({
    success: z.literal(true),
    data: z.object({ entityId: z.string(), jobId: z.string().optional() }),
  }),
  z.object({
    success: z.literal(false),
    error: z.string(),
    code: z.string().optional(),
  }),
]);

/** The operation a request asks for, as `system_generate` takes it. */
function operationOf(request: GenerateFromSourcesRequest): {
  kind: "prompt-from-source";
  entityType: string;
  source: { entityType: string; entityId: string };
  additionalSourceIds?: string[];
  prompt?: string;
} {
  const [first = "", ...rest] = request.source.entityIds;
  return {
    kind: "prompt-from-source",
    entityType: request.entityType,
    source: { entityType: request.source.entityType, entityId: first },
    ...(rest.length > 0 && { additionalSourceIds: rest }),
    ...(request.prompt !== undefined && { prompt: request.prompt }),
  };
}

/** The operation an approval was given for, as far as a request states one. */
const approvedOperationSchema = z.object({
  operation: z.looseObject({
    kind: z.literal("prompt-from-source"),
    entityType: z.string(),
    source: z.looseObject({ entityType: z.string(), entityId: z.string() }),
    additionalSourceIds: z.array(z.string()).optional(),
    prompt: z.string().optional(),
  }),
});

/**
 * Whether an approval is the one a confirmation of this same request handed
 * out: the same type, written from the same entries, with the same prompt.
 * The tool runs what it approved, so a request that differs would have its
 * difference dropped without a word. The tool's own gate holds the token.
 */
function approves(
  approval: Record<string, unknown>,
  request: GenerateFromSourcesRequest,
): boolean {
  const approved = approvedOperationSchema.safeParse(approval);
  if (!approved.success) return false;
  const { operation } = approved.data;
  const asked = operationOf(request);
  const askedIds = [
    asked.source.entityId,
    ...(asked.additionalSourceIds ?? []),
  ];
  const approvedIds = [
    operation.source.entityId,
    ...(operation.additionalSourceIds ?? []),
  ];
  return (
    operation.entityType === asked.entityType &&
    operation.source.entityType === asked.source.entityType &&
    operation.prompt === asked.prompt &&
    approvedIds.length === askedIds.length &&
    approvedIds.every((id, index) => id === askedIds[index])
  );
}

/**
 * Answer the generate-from-sources contract with `system_generate` itself,
 * run as the caller the request names. A request asks; the approval its
 * confirmation hands out, sent back with the same request, runs it.
 */
export function answerGenerateFromSources(
  tools: readonly Tool[],
  messageBus: IMessageBus,
  logger: Logger,
): () => void {
  return answerContract(
    messageBus,
    generateFromSourcesContract,
    async (request): Promise<GenerateFromSourcesResponse> => {
      const generate = tools.find(({ name }) => name === "system_generate");
      if (!generate) {
        return { status: "refused", error: "Generation is unavailable." };
      }
      if (request.approval && !approves(request.approval, request)) {
        return {
          status: "refused",
          error: "The approval is not for this generation.",
        };
      }
      const toolContext: ToolContext = {
        interfaceType: request.interfaceType,
        actor: request.actor,
        userPermissionLevel: request.userPermissionLevel,
      };
      const answer = toolAnswerSchema.parse(
        await generate.handler(
          request.approval ?? { operation: operationOf(request) },
          toolContext,
        ),
      );
      if ("needsConfirmation" in answer) {
        return {
          status: "confirm",
          summary: answer.summary,
          ...(answer.completionSummary !== undefined && {
            completionSummary: answer.completionSummary,
          }),
          preview: answer.preview,
          approval: answer.args,
        };
      }
      if (answer.success) {
        return {
          status: "queued",
          entityId: answer.data.entityId,
          ...(answer.data.jobId !== undefined && { jobId: answer.data.jobId }),
        };
      }
      return {
        status: "refused",
        error: answer.error,
        ...(answer.code !== undefined && { code: answer.code }),
      };
    },
    { owner: "system", logger },
  );
}

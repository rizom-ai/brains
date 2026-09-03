import {
  createConfirmationGate,
  type Tool,
  type ToolContext,
  type ToolResponse,
} from "@brains/mcp-service";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import type { EntityReactionContext } from "../entity/entity-definition-contract";
import type { AnyServiceToolDefinition } from "./service-definition-contract";
import { createToolAgent, isToolAsk } from "./tool-agent";
import type { AgentNamespace } from "../contracts/agent";

export const confirmationTokenField = "_rizomConfirmationToken";

export function toolConfirmationToken(input: unknown): string | undefined {
  if (input === null || typeof input !== "object") return undefined;
  const token = Reflect.get(input, confirmationTokenField);
  return typeof token === "string" ? token : undefined;
}

/**
 * A declared tool, as the runtime serves it.
 *
 * Shared because two families declare tools for the same reasons: a service
 * offers what it can do to the brain, and an interface offers what only
 * makes sense through it. The parse, the confirmation gate and the success
 * envelope are the runtime's either way — what differs is only the context
 * the handler runs in, which is why that arrives as an argument.
 */
export function createRuntimeTool(input: {
  readonly definition: AnyServiceToolDefinition;
  readonly pluginId: string;
  /**
   * What the handler is handed besides its input. A service builds a
   * reaction context; an interface has no entities of its own and builds a
   * narrower one.
   */
  readonly reaction: () => EntityReactionContext;
  /**
   * Where the caller is put for the duration, so nested work can attribute
   * itself. A service runs handlers inside its own async storage; an
   * interface without that storage passes the call through.
   */
  readonly run?:
    (<T>(context: ToolContext, operation: () => T) => T) | undefined;
  /**
   * The brain, for a family whose tools may be the way in. Absent for one
   * whose tools are capabilities the agent calls — those must not call back.
   * Named consumer: @brains/mcp, through the interface family.
   */
  readonly agent?: (() => AgentNamespace | undefined) | undefined;
}): Tool {
  const { definition, pluginId, reaction } = input;
  const run =
    input.run ??
    (<T>(_context: ToolContext, operation: () => T): T => operation());
  const name = `${pluginId}_${definition.name}`;
  const confirmations = createConfirmationGate({
    label: definition.name,
    requestNoun: "the operation",
  });
  return {
    name,
    description: definition.description,
    inputSchema: definition.input.shape,
    outputSchema: definition.output,
    visibility: definition.permission ?? "admin",
    sideEffects:
      definition.sideEffects ?? (definition.confirmation ? "writes" : "none"),
    ...(definition.agentTool === undefined
      ? {}
      : { agentTool: definition.agentTool }),
    ...(definition.directMcpExposure === undefined
      ? {}
      : { directMcpExposure: definition.directMcpExposure }),
    handler: async (rawInput, toolContext): Promise<ToolResponse> => {
      try {
        const token = toolConfirmationToken(rawInput);
        if (token !== undefined) {
          const gateError = confirmations.validateConfirmed(token, rawInput);
          if (gateError) return gateError;
          const record = {
            ...z.record(z.string(), z.unknown()).parse(rawInput),
          };
          delete record[confirmationTokenField];
          rawInput = record;
        }
        const parsed = definition.input.parse(rawInput);
        if (token === undefined && definition.confirmation) {
          return {
            needsConfirmation: true,
            toolName: name,
            summary:
              typeof definition.confirmation === "function"
                ? definition.confirmation(parsed)
                : definition.confirmation,
            args: confirmations.buildArgs((confirmationToken) => ({
              ...z.record(z.string(), z.unknown()).parse(parsed),
              [confirmationTokenField]: confirmationToken,
            })),
          };
        }

        const output = await run(toolContext, () =>
          definition.execute({
            ...reaction(),
            input: parsed,
            signal: toolContext.signal ?? new AbortController().signal,
            caller: toolContext,
            agent: createToolAgent({
              pluginId,
              toolName: name,
              // Defaults to true, and a tool that never says otherwise is one
              // the agent may call — so it is one that must not call back.
              agentTool: definition.agentTool ?? true,
              agent: input.agent ?? ((): undefined => undefined),
              caller: () => toolContext,
            }),
          }),
        );
        // An ask is not an answer: it does not go through the output schema,
        // and it does not arrive as `{success: true}`.
        if (isToolAsk(output)) {
          return {
            needsConfirmation: true,
            toolName: output.toolName,
            summary: output.summary,
            ...(output.completionSummary
              ? { completionSummary: output.completionSummary }
              : {}),
            ...(output.preview ? { preview: output.preview } : {}),
            args: {
              approvalId: output.approvalId,
              conversationId: output.conversationId,
              ...(output.toolCallId ? { toolCallId: output.toolCallId } : {}),
              originalArgs: output.originalArgs,
            },
          };
        }
        return {
          success: true,
          data: definition.output.parse(output),
        };
      } catch (error) {
        return { success: false, error: getErrorMessage(error) };
      }
    },
  };
}

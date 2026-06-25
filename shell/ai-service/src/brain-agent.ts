/**
 * BrainAgent - Factory for creating ToolLoopAgent instances
 *
 * Uses AI SDK 6's ToolLoopAgent with:
 * - callOptionsSchema for type-safe runtime configuration
 * - prepareCall for dynamic identity/permission injection
 * - activeTools for permission-based tool filtering
 */
import { ToolLoopAgent, stepCountIs, type LanguageModel } from "ai";
import { z } from "@brains/utils";
import type { BrainCharacter, AnchorProfile } from "@brains/identity-service";
import { toolConfirmationSchema, type Tool } from "@brains/mcp-service";
import type { UserPermissionLevel } from "@brains/templates";
import type { IMessageBus } from "@brains/messaging-service";
import type { BrainAgent, BrainAgentFactory } from "./agent-types";
import { supportsTemperature } from "./provider-selection";
import { buildInstructions } from "./brain-instructions";
import { createMessageBusEmitter } from "./tool-events";
import { convertToSDKTools } from "./sdk-tools";

/**
 * Schema for runtime call options
 * Defines type-safe inputs passed at generation time
 */
export const brainCallOptionsSchema = z.object({
  userPermissionLevel: z.enum(["anchor", "trusted", "public"]),
  conversationId: z.string(),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
  interfaceType: z.string(),
  agentContextInstructions: z.string().optional(),
  disableTools: z.boolean().optional(),
  enableCreateUpload: z.boolean().optional(),
  enableCreateTransform: z.boolean().optional(),
  enableCreateSourceAttachment: z.boolean().optional(),
  enableUploadSave: z.boolean().optional(),
  disableDocumentGenerate: z.boolean().optional(),
  disableSystemCreate: z.boolean().optional(),
});

export type BrainCallOptions = z.infer<typeof brainCallOptionsSchema>;

export function shouldStopToolLoop(input: {
  steps: Array<{
    toolResults?: Array<
      { output?: unknown; toolName?: string } & Record<string, unknown>
    >;
  }>;
}): boolean {
  const latestStep = input.steps.at(-1);
  return (
    latestStep?.toolResults?.some(
      (result) =>
        toolConfirmationSchema.safeParse(result.output).success ||
        result.toolName === "playbook_start",
    ) ?? false
  );
}

/**
 * Configuration for creating a BrainAgent
 * Model and provider options are set at factory creation time
 */
export interface BrainAgentConfig {
  identity: BrainCharacter;
  profile?: AnchorProfile;
  tools: Tool[];
  pluginInstructions?: string[];
  agentInstructions?: string[];
  stepLimit?: number;
  getToolsForPermission: (level: UserPermissionLevel) => Tool[];
}

/**
 * Options for creating a brain agent factory
 */
export interface BrainAgentFactoryOptions {
  model: LanguageModel;
  modelId?: string | undefined;
  webSearch?: boolean | undefined;
  temperature?: number | undefined;
  maxTokens?: number | undefined;
  /** Message bus for emitting tool invocation events */
  messageBus: IMessageBus;
}

/**
 * Create a brain agent factory
 *
 * The factory closure captures model and provider options,
 * then returns a function that creates agents with specific config
 */
export function createBrainAgentFactory(
  options: BrainAgentFactoryOptions,
): BrainAgentFactory {
  const { model, modelId, webSearch, temperature, maxTokens, messageBus } =
    options;
  const supportsTemp = supportsTemperature(modelId);

  // Create event emitter backed by message bus
  const emitter = createMessageBusEmitter(messageBus);

  return function createBrainAgent(config: BrainAgentConfig): BrainAgent {
    // SDK requires `tools` at construction; prepareCall replaces them per-call
    // with the right context, and activeTools filters by permission.
    const allTools = convertToSDKTools(
      config.tools,
      {
        conversationId: "",
        interfaceType: "agent",
      },
      emitter,
    );

    return new ToolLoopAgent({
      model,
      callOptionsSchema: brainCallOptionsSchema,

      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- Return type inferred by SDK
      prepareCall: ({ options: callOptions, ...settings }) => {
        // Get tools available for this permission level, unless this bounded
        // model turn is intentionally text-only (for example, after executing
        // an already-confirmed action).
        const allowedTools = callOptions.disableTools
          ? []
          : config
              .getToolsForPermission(callOptions.userPermissionLevel)
              .filter(
                (tool) =>
                  !(
                    callOptions.disableDocumentGenerate === true &&
                    tool.name === "document_generate"
                  ) &&
                  !(
                    callOptions.disableSystemCreate === true &&
                    tool.name === "system_create"
                  ) &&
                  !(
                    callOptions.enableUploadSave !== true &&
                    tool.name === "system_upload_save"
                  ),
              );
        const allowedToolNames = allowedTools.map((t) => t.name);

        // Convert tools with proper context from call options
        const toolsWithContext = convertToSDKTools(
          allowedTools,
          {
            conversationId: callOptions.conversationId,
            channelId: callOptions.channelId,
            channelName: callOptions.channelName,
            interfaceType: callOptions.interfaceType,
            userPermissionLevel: callOptions.userPermissionLevel,
            enableCreateUpload: callOptions.enableCreateUpload,
            enableCreateTransform: callOptions.enableCreateTransform,
            enableCreateSourceAttachment:
              callOptions.enableCreateSourceAttachment,
          },
          emitter,
        );

        return {
          ...settings,
          instructions: buildInstructions(
            config.identity,
            callOptions.userPermissionLevel,
            config.pluginInstructions,
            config.profile,
            config.agentInstructions,
            callOptions.agentContextInstructions,
          ),
          tools: toolsWithContext,
          activeTools: allowedToolNames,
          // Provider options
          ...(temperature !== undefined && supportsTemp && { temperature }),
          ...(maxTokens !== undefined && { maxTokens }),
          ...(webSearch && {
            providerOptions: {
              anthropic: {
                webSearch: true,
              },
            },
          }),
        };
      },

      tools: allTools,
      stopWhen: [shouldStopToolLoop, stepCountIs(config.stepLimit ?? 10)],
    });
  };
}

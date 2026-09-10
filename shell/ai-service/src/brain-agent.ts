/**
 * BrainAgent - Factory for creating ToolLoopAgent instances
 *
 * Uses AI SDK 6's ToolLoopAgent with:
 * - callOptionsSchema for type-safe runtime configuration
 * - prepareCall for dynamic identity/permission injection
 * - activeTools for permission-based tool filtering
 */
import { ToolLoopAgent, stepCountIs, type LanguageModel } from "ai";
import { guestInterfaceType } from "@brains/contracts/chat";
import {
  assertGuestPermission,
  guestInstructions,
  guestModelMessages,
  isGuestToolAllowed,
  requireGuestExecutionPolicy,
} from "./guest-execution";
import {
  GuestTurnBudget,
  type GuestExecutionAccounting,
} from "./guest-turn-budget";
import { toolConfirmationSchema, type Tool } from "@brains/mcp-service";
import type { IMessageBus } from "@brains/messaging-service";
import {
  brainCallOptionsSchema,
  type BrainAgent,
  type BrainAgentConfig,
  type BrainAgentFactory,
  type BrainAgentResult,
  type BrainCallOptions,
} from "./agent-types";
import { resolveTextModelCapabilities } from "./provider-selection";
import type { ReasoningEffort } from "./types";
import { buildInstructions } from "./brain-instructions";
import { createMessageBusEmitter } from "./tool-events";
import { convertToSDKTools } from "./sdk-tools";

export type { BrainAgentConfig, BrainCallOptions } from "./agent-types";

export function filterToolsForCallOptions(
  tools: Tool[],
  callOptions: Pick<
    BrainCallOptions,
    "interfaceType" | "hasPriorResponseCandidate"
  >,
): Tool[] {
  return callOptions.interfaceType === guestInterfaceType
    ? tools.filter(isGuestToolAllowed)
    : tools;
}

function isPlaybookStartInput(input: unknown): boolean {
  return (
    typeof input === "object" &&
    input !== null &&
    "action" in input &&
    input.action === "start"
  );
}

export function shouldStopToolLoop(input: {
  steps: Array<{
    toolCalls?: Array<{
      toolCallId?: string;
      toolName?: string;
      input?: unknown;
    }>;
    toolResults?: Array<
      { output?: unknown; toolName?: string } & Record<string, unknown>
    >;
  }>;
}): boolean {
  const latestStep = input.steps.at(-1);
  const hasConfirmation =
    latestStep?.toolResults?.some(
      (result) => toolConfirmationSchema.safeParse(result.output).success,
    ) ?? false;
  const hasPlaybookStart =
    latestStep?.toolCalls?.some(
      (call) =>
        call.toolName === "playbook_manage" && isPlaybookStartInput(call.input),
    ) ?? false;
  return hasConfirmation || hasPlaybookStart;
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
  reasoningEffort?: ReasoningEffort | undefined;
  /** Message bus for emitting tool invocation events */
  messageBus: IMessageBus;
  /** Required for guests: verified model token/cost and retrieval cost accounting. */
  guestAccounting?: GuestExecutionAccounting;
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
  const {
    model,
    modelId,
    webSearch,
    temperature,
    maxTokens,
    reasoningEffort,
    messageBus,
  } = options;
  const capabilities = resolveTextModelCapabilities(modelId);

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

    const createSDKAgent = (budget?: GuestTurnBudget): BrainAgent =>
      new ToolLoopAgent({
        model: budget ? budget.wrapModel(model) : model,
        callOptionsSchema: brainCallOptionsSchema,

        // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- Return type inferred by SDK
        prepareCall: ({ options: callOptions, ...settings }) => {
          assertGuestPermission(callOptions);
          const guest = callOptions.interfaceType === guestInterfaceType;
          if (
            guest &&
            (callOptions.actor ||
              callOptions.agentContextInstructions ||
              callOptions.enableCreateUpload ||
              callOptions.enableCreateTransform)
          ) {
            throw new Error("Guest execution denied");
          }
          // Get tools available for this permission level, unless this bounded
          // model turn is intentionally text-only (for example, after executing
          // an already-confirmed action).
          const allowedTools = callOptions.disableTools
            ? []
            : filterToolsForCallOptions(
                config.getToolsForPermission(callOptions.userPermissionLevel),
                callOptions,
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
              actor: callOptions.actor,
              displayName: callOptions.displayName,
              userPermissionLevel: callOptions.userPermissionLevel,
              isAnchor: callOptions.isAnchor,
              enableCreateUpload: callOptions.enableCreateUpload,
              enableCreateTransform: callOptions.enableCreateTransform,
            },
            emitter,
            budget,
          );

          return {
            ...settings,
            ...(guest && {
              messages: guestModelMessages(settings.messages),
              allowSystemInMessages: false,
              providerOptions: {},
              maxRetries: 0,
              ...(budget
                ? { maxOutputTokens: budget.policy.limits.outputTokens }
                : {}),
            }),
            instructions: guest
              ? guestInstructions
              : buildInstructions(
                  config.identity,
                  callOptions.userPermissionLevel,
                  config.pluginInstructions,
                  config.profile,
                  config.agentInstructions,
                  callOptions.agentContextInstructions,
                  callOptions.isAnchor,
                ),
            tools: toolsWithContext,
            activeTools: allowedToolNames,
            // Provider options
            ...(temperature !== undefined &&
              capabilities.supportsTemperature && { temperature }),
            ...(maxTokens !== undefined && { maxTokens }),
            ...((capabilities.provider === "openai" &&
            reasoningEffort !== undefined
              ? true
              : webSearch) &&
              !guest && {
                providerOptions: {
                  ...(capabilities.provider === "openai" &&
                    reasoningEffort && {
                      openai: { reasoningEffort },
                    }),
                  ...(webSearch && {
                    anthropic: { webSearch: true },
                  }),
                },
              }),
          };
        },

        tools: allTools,
        stopWhen: [
          shouldStopToolLoop,
          stepCountIs(
            budget?.policy.limits.toolSteps ?? config.stepLimit ?? 10,
          ),
          ...(budget ? [(): boolean => budget.exhausted()] : []),
        ],
      });
    const authenticated = createSDKAgent();
    return {
      generate: async (params): Promise<BrainAgentResult> => {
        assertGuestPermission(params.options);
        const policy = requireGuestExecutionPolicy(params.options);
        if (!policy) return authenticated.generate(params);
        const last = guestModelMessages(params.messages).at(-1);
        if (
          last?.role !== "user" ||
          typeof last.content !== "string" ||
          !last.content.trim() ||
          last.content.length > policy.limits.messageCharacters
        )
          throw new Error("Guest input limit exceeded");
        const budget = new GuestTurnBudget(
          policy,
          options.guestAccounting,
          params.abortSignal,
        );
        try {
          return await createSDKAgent(budget).generate({
            ...params,
            abortSignal: budget.signal,
          });
        } finally {
          // Completion, not SSE disconnection, ends the accounting lifetime.
          budget.dispose();
        }
      },
    };
  };
}

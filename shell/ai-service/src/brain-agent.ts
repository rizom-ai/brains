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
  assertGuestCallOptions,
  assertGuestPermission,
  guestModelMessages,
  guestVisitorInstructions,
  isGuestToolAllowed,
  requireGuestExecutionPolicy,
} from "./guest-execution";
import { guestTurnSettlement, type GuestPricing } from "./openai-guest-pricing";
import { judgeGuestQuestion, neutralGuestRefusal } from "./guest-screening";
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
  /** Prices a guest turn from its reported usage; absent: guest cost is unknown. */
  guestPricing?: GuestPricing | undefined;
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

  const factory: BrainAgentFactory = function createBrainAgent(
    config: BrainAgentConfig,
  ): BrainAgent {
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

    const agent: BrainAgent = new ToolLoopAgent({
      model,
      callOptionsSchema: brainCallOptionsSchema,

      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- Return type inferred by SDK
      prepareCall: ({ options: callOptions, ...settings }) => {
        assertGuestPermission(callOptions);
        assertGuestCallOptions(callOptions);
        const guest = callOptions.interfaceType === guestInterfaceType;
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
        );

        return {
          ...settings,
          // A visitor is a public user of the same agent: text-only history,
          // no system messages from the conversation.
          ...(guest && {
            messages: guestModelMessages(settings.messages),
            allowSystemInMessages: false,
            // Only the options set below reach the provider for a guest.
            providerOptions: {},
          }),
          instructions:
            buildInstructions(
              config.identity,
              callOptions.userPermissionLevel,
              config.pluginInstructions,
              config.profile,
              config.agentInstructions,
              callOptions.agentContextInstructions,
              callOptions.isAnchor,
            ) + (guest ? `\n\n${guestVisitorInstructions}` : ""),
          tools: toolsWithContext,
          activeTools: allowedToolNames,
          // Provider options
          ...(temperature !== undefined &&
            capabilities.supportsTemperature && { temperature }),
          ...(maxTokens !== undefined && { maxTokens }),
          // Guests answer from the brain, never from provider web search.
          ...((capabilities.provider === "openai" &&
          reasoningEffort !== undefined
            ? true
            : webSearch && !guest) && {
            providerOptions: {
              ...(capabilities.provider === "openai" &&
                reasoningEffort && {
                  openai: { reasoningEffort },
                }),
              ...(webSearch &&
                !guest && {
                  anthropic: { webSearch: true },
                }),
            },
          }),
        };
      },

      tools: allTools,
      stopWhen: [shouldStopToolLoop, stepCountIs(config.stepLimit ?? 10)],
    });
    return {
      generate: async (params): Promise<BrainAgentResult> => {
        assertGuestPermission(params.options);
        assertGuestCallOptions(params.options);
        const policy = requireGuestExecutionPolicy(params.options);
        if (!policy) return agent.generate(params);
        const last = guestModelMessages(params.messages).at(-1);
        if (
          last?.role !== "user" ||
          typeof last.content !== "string" ||
          !last.content.trim() ||
          last.content.length > policy.limits.messageCharacters
        )
          throw new Error("Guest input limit exceeded");
        // The question is judged on the guest model before the tool loop:
        // a refused question never reaches the agent and costs the judgment.
        const judgment = await judgeGuestQuestion({
          model,
          messages: guestModelMessages(params.messages),
          screening: params.options.guestScreening,
          signal: params.abortSignal,
        });
        const judged = judgment.usage ? [{ usage: judgment.usage }] : [];
        if (judgment.kind === "judged" && judgment.category !== "in-scope")
          return {
            text: params.options.guestScreening?.refusal ?? neutralGuestRefusal,
            steps: [],
            usage: {
              inputTokens: judgment.usage.inputTokens,
              outputTokens: judgment.usage.outputTokens,
              totalTokens: judgment.usage.totalTokens,
            },
            guestSettlement: guestTurnSettlement(judged, options.guestPricing),
            guestScreening: { outcome: "refused", category: judgment.category },
          };
        const result = await agent.generate(params);
        // The SDK result exposes its fields as getters; attach, never copy.
        return Object.assign(result, {
          guestSettlement: guestTurnSettlement(
            [...judged, ...result.steps],
            options.guestPricing,
          ),
          guestScreening:
            judgment.kind === "judged"
              ? { outcome: "answered" as const }
              : { outcome: "unscreened" as const },
        });
      },
    };
  };
  return factory;
}

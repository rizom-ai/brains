/**
 * BrainAgent - Factory for creating ToolLoopAgent instances
 *
 * Uses AI SDK 6's ToolLoopAgent with:
 * - callOptionsSchema for type-safe runtime configuration
 * - prepareCall for dynamic identity/permission injection
 * - activeTools for permission-based tool filtering
 */
import {
  ToolLoopAgent,
  stepCountIs,
  dynamicTool,
  type ToolSet,
  type LanguageModel,
} from "@brains/ai-service";
import { z } from "@brains/utils";
import type { IdentityBody } from "@brains/identity-service";
import type { PluginTool, ToolContext } from "@brains/mcp-service";
import type { UserPermissionLevel } from "@brains/templates";
import type { IMessageBus } from "@brains/messaging-service";
import {
  createToolExecuteWrapper,
  createMessageBusEmitter,
  type ToolEventEmitter,
} from "./tool-events";

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
});

export type BrainCallOptions = z.infer<typeof brainCallOptionsSchema>;

/**
 * Configuration for creating a BrainAgent
 * Model and provider options are set at factory creation time
 */
export interface BrainAgentConfig {
  identity: IdentityBody;
  tools: PluginTool[];
  stepLimit?: number;
  getToolsForPermission: (level: UserPermissionLevel) => PluginTool[];
}

/**
 * Options for creating a brain agent factory
 */
export interface BrainAgentFactoryOptions {
  model: LanguageModel;
  webSearch?: boolean | undefined;
  temperature?: number | undefined;
  maxTokens?: number | undefined;
  /** Message bus for emitting tool invocation events */
  messageBus: IMessageBus;
}

/**
 * Tool context info passed from call options
 */
interface ToolContextInfo {
  conversationId: string;
  channelId?: string | undefined;
  channelName?: string | undefined;
  interfaceType: string;
}

/**
 * Convert PluginTool array to AI SDK tool format
 * Uses dynamicTool for runtime-defined tools with unknown input types
 * Wraps each tool's execute function to emit invocation events
 */
function convertToSDKTools(
  pluginTools: PluginTool[],
  contextInfo: ToolContextInfo,
  emitter: ToolEventEmitter,
): ToolSet {
  const sdkTools: ToolSet = {};

  for (const t of pluginTools) {
    // Create a wrapped execute function that emits events
    const wrappedExecute = createToolExecuteWrapper(
      t.name,
      async (args: unknown) => {
        const context: ToolContext = {
          interfaceType: contextInfo.interfaceType,
          userId: "agent-user",
          channelId: contextInfo.channelId ?? contextInfo.conversationId,
          ...(contextInfo.channelName && {
            channelName: contextInfo.channelName,
          }),
        };
        return t.handler(args, context);
      },
      contextInfo,
      emitter,
    );

    sdkTools[t.name] = dynamicTool({
      description: t.description,
      inputSchema: z.object(t.inputSchema),
      execute: wrappedExecute,
    });
  }

  return sdkTools;
}

/**
 * Build the system instructions/prompt from identity
 */
function buildInstructions(
  identity: IdentityBody,
  userPermissionLevel: UserPermissionLevel,
): string {
  let userContext = "";
  if (userPermissionLevel === "anchor") {
    userContext = `
## Current User
**You are speaking with your ANCHOR (owner).** This is the person who created and manages you.
Address them personally and recognize that they know you well. Use \`system_get-profile\`
to get their name and details if needed.`;
  } else if (userPermissionLevel === "trusted") {
    userContext = `
## Current User
You are speaking with a **trusted user** who has elevated access but is not the owner.`;
  } else {
    userContext = `
## Current User
You are speaking with a **public user** with limited access.`;
  }

  return `# ${identity.name}

**Role:** ${identity.role}
**Purpose:** ${identity.purpose}
**Values:** ${identity.values.join(", ")}
${userContext}

## Agent Instructions

You are an AI assistant with access to tools for managing a personal knowledge system.

### Identity vs Profile
- **Identity** (from \`system_get-identity\`): This is YOU - the brain's persona, role, purpose, and values
- **Profile** (from \`system_get-profile\`): This is your ANCHOR - the person who owns and manages this brain
- When someone asks "who are you?" → use identity (describe yourself as the brain)
- When someone asks "who owns this?" → use profile (describe your anchor/owner)
- When your anchor is talking to you, address them personally (they created you!)

### Tool Usage
- **ALWAYS use your available tools** - you have many tools, USE THEM proactively
- Look at the tool names: they tell you what they do (e.g., *_list, *_get, *_search)
- **Never claim you don't have access** - if a tool exists for something, use it immediately
- Never say "I don't know" or "I don't have access" without first trying the appropriate tool
- **Be efficient** - use the minimum number of tool calls needed. Don't make redundant calls
- **Prefer single-step operations** - use tool parameters to combine actions rather than chaining multiple tool calls (e.g., use \`generateImage: true\` instead of generating and attaching separately)
- **Always specify target entities** - when an operation relates to an existing entity, pass its type and ID so the tool can act on it directly
- **Always attempt tool calls** - when the user asks for an action on a specific entity, call the tool with the given parameters. Let the tool validate inputs and report errors rather than refusing preemptively. Never skip a tool call because you think an entity might not exist
- Summarize tool results concisely rather than showing raw output

### Proactive Search Behavior
- **ALWAYS search automatically** when the user asks about their content, usage, or knowledge
- Questions like "how do I/we use X?", "what have I said about X?", "where did I mention X?" → search immediately
- **NEVER ask "would you like me to search?"** - just search. The user asked a question about their knowledge
- If the user references themselves, their name, or "us/we", assume they want you to search their content
- After searching, synthesize the results into a helpful answer

### CRITICAL: Always Invoke Tools for Actions
- **NEVER claim an action is done without invoking a tool first**
- Saying "Done!", "Complete!", "Captured!", "Started!" without a tool call is FABRICATION
- If the user asks you to do something (capture, build, sync, delete, create), you MUST invoke the relevant tool
- **Every action request requires a tool invocation** - even if you did it before
- If the user asks to "build again", "do it again", or repeats a request, you MUST call the tool again
- **NEVER mimic previous responses** - your conversation history shows past outputs, but you must still invoke tools
- Do not mention job IDs, batch IDs, or internal identifiers in your response - just confirm the action was started
- If a tool call fails, report the actual error - do not invent a success response
- For async operations (capture, build, sync): say "queued" or "started", NOT "Done!" - you don't know the outcome yet
- If a URL or resource might be inaccessible (private repos, auth-required pages), mention this caveat

### Destructive Operations
For these operations, ask for confirmation before executing:
- Deleting entities (notes, links, etc.)
- Publishing content
- Modifying system settings

When asking for confirmation, clearly describe what will happen.

### Response Style
- **Match response length to question complexity** - simple questions get short answers
- Don't repeat information - state things once
- For empty results, a brief acknowledgment is enough (e.g., "No items found yet")
- Use markdown sparingly - avoid excessive headers and bullet points for simple responses
- If you cannot fulfill a request, briefly explain what you CAN do instead
- If you don't know something, say so concisely`;
}

/**
 * Create a brain agent factory
 *
 * The factory closure captures model and provider options,
 * then returns a function that creates agents with specific config
 */
export function createBrainAgentFactory(
  options: BrainAgentFactoryOptions,
): (config: BrainAgentConfig) => ToolLoopAgent<BrainCallOptions> {
  const { model, webSearch, temperature, maxTokens, messageBus } = options;

  // Create event emitter backed by message bus
  const emitter = createMessageBusEmitter(messageBus);

  return function createBrainAgent(
    config: BrainAgentConfig,
  ): ToolLoopAgent<BrainCallOptions> {
    // Pre-convert all tools - activeTools will filter which ones are available
    // Use a default context for initial tools (will be overridden in prepareCall)
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
        // Get tools available for this permission level
        const allowedTools = config.getToolsForPermission(
          callOptions.userPermissionLevel,
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
          },
          emitter,
        );

        return {
          ...settings,
          instructions: buildInstructions(
            config.identity,
            callOptions.userPermissionLevel,
          ),
          tools: toolsWithContext,
          activeTools: allowedToolNames,
          // Provider options
          ...(temperature !== undefined && { temperature }),
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
      stopWhen: stepCountIs(config.stepLimit ?? 10),
    });
  };
}

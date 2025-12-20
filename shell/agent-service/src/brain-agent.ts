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
import type { UserPermissionLevel } from "@brains/permission-service";

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
 */
function convertToSDKTools(
  pluginTools: PluginTool[],
  contextInfo: ToolContextInfo,
): ToolSet {
  const sdkTools: ToolSet = {};

  for (const t of pluginTools) {
    sdkTools[t.name] = dynamicTool({
      description: t.description,
      inputSchema: z.object(t.inputSchema),
      execute: async (args: unknown) => {
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
- Summarize tool results concisely rather than showing raw output

### Proactive Search Behavior
- **ALWAYS search automatically** when the user asks about their content, usage, or knowledge
- Questions like "how do I/we use X?", "what have I said about X?", "where did I mention X?" → search immediately
- **NEVER ask "would you like me to search?"** - just search. The user asked a question about their knowledge
- If the user references themselves, their name, or "us/we", assume they want you to search their content
- After searching, synthesize the results into a helpful answer

### CRITICAL: Always Invoke Tools for Actions
- **Every action request requires a tool invocation** - even if you did it before
- If the user asks to "build again", "do it again", or repeats a request, you MUST call the tool again
- **NEVER mimic previous responses** - your conversation history shows past outputs, but you must still invoke tools
- Do not mention job IDs, batch IDs, or internal identifiers in your response - just confirm the action was started
- If a tool call fails, report the actual error - do not invent a success response

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
  const { model, webSearch, temperature, maxTokens } = options;

  return function createBrainAgent(
    config: BrainAgentConfig,
  ): ToolLoopAgent<BrainCallOptions> {
    // Pre-convert all tools - activeTools will filter which ones are available
    // Use a default context for initial tools (will be overridden in prepareCall)
    const allTools = convertToSDKTools(config.tools, {
      conversationId: "",
      interfaceType: "agent",
    });

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
        const toolsWithContext = convertToSDKTools(allowedTools, {
          conversationId: callOptions.conversationId,
          channelId: callOptions.channelId,
          channelName: callOptions.channelName,
          interfaceType: callOptions.interfaceType,
        });

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

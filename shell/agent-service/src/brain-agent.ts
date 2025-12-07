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
 * Convert PluginTool array to AI SDK tool format
 * Uses dynamicTool for runtime-defined tools with unknown input types
 */
function convertToSDKTools(
  pluginTools: PluginTool[],
  conversationId: string,
): ToolSet {
  const sdkTools: ToolSet = {};

  for (const t of pluginTools) {
    sdkTools[t.name] = dynamicTool({
      description: t.description,
      inputSchema: z.object(t.inputSchema),
      execute: async (args: unknown) => {
        const context: ToolContext = {
          interfaceType: "agent",
          userId: "agent-user",
          channelId: conversationId,
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
- You can call multiple tools in sequence if needed
- Show the formatted output from tools directly to users

### Destructive Operations
For these operations, ask for confirmation before executing:
- Deleting entities (notes, links, etc.)
- Publishing content
- Modifying system settings

When asking for confirmation, clearly describe what will happen.

### Response Style
- Be concise and helpful
- Use markdown formatting for readability
- If a tool fails, explain the error clearly
- If you don't know something, say so`;
}

/**
 * Create a brain agent factory
 *
 * The factory closure captures model and provider options,
 * then returns a function that creates agents with specific config
 */
export function createBrainAgentFactory(options: BrainAgentFactoryOptions) {
  const { model, webSearch, temperature, maxTokens } = options;

  return function createBrainAgent(config: BrainAgentConfig) {
    // Pre-convert all tools - activeTools will filter which ones are available
    const allTools = convertToSDKTools(config.tools, "");

    return new ToolLoopAgent({
      model,
      callOptionsSchema: brainCallOptionsSchema,

      prepareCall: ({ options: callOptions, ...settings }) => {
        // Get tools available for this permission level
        const allowedTools = config.getToolsForPermission(
          callOptions.userPermissionLevel,
        );
        const allowedToolNames = allowedTools.map((t) => t.name);

        // Convert tools with proper conversationId for context
        const toolsWithContext = convertToSDKTools(
          allowedTools,
          callOptions.conversationId,
        );

        return {
          ...settings,
          system: buildInstructions(
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

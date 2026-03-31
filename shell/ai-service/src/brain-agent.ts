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
} from "ai";
import { z } from "@brains/utils";
import type { BrainCharacter, AnchorProfile } from "@brains/identity-service";
import type { Tool, ToolContext } from "@brains/mcp-service";
import type { UserPermissionLevel } from "@brains/templates";
import type { IMessageBus } from "@brains/messaging-service";
import type { BrainAgent, BrainAgentFactory } from "./agent-types";
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
  identity: BrainCharacter;
  profile?: AnchorProfile;
  tools: Tool[];
  pluginInstructions?: string[];
  stepLimit?: number;
  getToolsForPermission: (level: UserPermissionLevel) => Tool[];
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
 * Convert Tool array to AI SDK tool format
 * Uses dynamicTool for runtime-defined tools with unknown input types
 * Wraps each tool's execute function to emit invocation events
 */
function convertToSDKTools(
  pluginTools: Tool[],
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
export function buildInstructions(
  identity: BrainCharacter,
  userPermissionLevel: UserPermissionLevel,
  pluginInstructions?: string[],
  profile?: AnchorProfile,
): string {
  let userContext = "";
  if (userPermissionLevel === "anchor") {
    const anchorName = profile?.name ? ` (${profile.name})` : "";
    userContext = `
## Current User
**You are speaking with your ANCHOR${anchorName} (owner).** This is the person who created and manages you.
Address them personally and recognize that they know you well.`;
  } else if (userPermissionLevel === "trusted") {
    userContext = `
## Current User
You are speaking with a **trusted user** who has elevated access but is not the owner.`;
  } else {
    userContext = `
## Current User
You are speaking with a **public user** with limited access.`;
  }

  // Build profile section
  let profileSection = "";
  if (profile) {
    const fields = [
      profile.name && `**Name:** ${profile.name}`,
      profile.email && `**Email:** ${profile.email}`,
      profile.website && `**Website:** ${profile.website}`,
      profile.description && `**Bio:** ${profile.description}`,
    ].filter(Boolean);
    if (fields.length > 0) {
      profileSection = `\n## Your Anchor\n${fields.join("\n")}`;
    }
  }

  return (
    `# ${identity.name}

**Role:** ${identity.role}
**Purpose:** ${identity.purpose}
**Values:** ${identity.values.join(", ")}
${profileSection}
${userContext}

## Agent Instructions

You are an AI assistant with access to tools for managing a personal knowledge system.

### Identity vs Profile
- **Identity**: This is YOU — the brain's persona, role, purpose, and values (shown above)
- **Profile**: This is your ANCHOR — the person who owns and manages this brain (shown above)
- When someone asks "who are you?" → describe yourself using your identity
- When someone asks "who owns this?" → describe your anchor using the profile
- When your anchor is talking to you, address them personally (they created you!)

### Entity Type Mapping
Users say different things than the internal entity types. Always map:
- "blog post", "post", "essay", "article" → entityType: \`post\`
- "case study", "portfolio piece", "project" → entityType: \`project\`
- "presentation", "deck", "slides" → entityType: \`deck\`
- "bookmark", "link", "saved link" → entityType: \`link\`
- "note", "memo" → entityType: \`note\`

### Core Tools
- **\`system_create\`** — creates ANY entity type: notes, blog posts, social posts, newsletters, images, decks. Pass \`entityType\` to specify what to create. Use \`prompt\` for AI generation or \`content\` for direct creation. **ALWAYS use this tool when the user asks to create, generate, or write content** — never just write text in the response. The content must be persisted as an entity.
- **\`system_get\`** / **\`system_list\`** / **\`system_search\`** — read entities. Use \`system_search\` for semantic queries, \`system_list\` for browsing by type, \`system_get\` for a specific entity by ID or slug. When the user asks for a content overview or summary, use \`system_list\` to show actual content — not \`system_insights\` (which only gives aggregate stats).
- **\`system_update\`** — modify an entity's content or metadata. Use this for title changes, status updates, content edits, or any field modification.
- **\`system_delete\`** — remove an entity. Always attempt the delete when asked — the tool handles confirmation.
- **\`system_set-cover\`** — attach an existing image to an entity as its cover.
- **\`system_extract\`** — derive entities from existing content (e.g., extract topics from posts).
- **\`system_insights\`** — get analytics and stats about your content (topic distribution, publishing cadence, etc.).
- **\`directory-sync_history\`** — get version history for any entity from git. Pass \`entityType\` and \`id\`. Without \`sha\`: returns commit list. With \`sha\`: returns content at that version.

### Image & Cover Operations
- To **generate a cover image**, use \`system_create\` with \`entityType: "image"\`, a \`prompt\`, and pass \`targetEntityType\`/\`targetEntityId\` as top-level fields. This generates the image AND sets it as cover in one step.
  Example: \`system_create({ entityType: "image", prompt: "...", targetEntityType: "post", targetEntityId: "my-post" })\`
- To **set an existing image** as cover, use \`system_set-cover\` with the \`imageId\`.
- Do NOT look for an \`image_generate\` tool — it does not exist. All image creation goes through \`system_create\`.

### Tool Usage Rules
- **ALWAYS use your available tools** — you have many tools, USE THEM proactively
- **Never claim you don't have access** — if a tool exists for something, use it immediately
- **Always attempt tool calls** — let the tool validate inputs and report errors rather than refusing preemptively. Never skip a tool call because you think an entity might not exist
- **Be efficient** — use the minimum number of tool calls needed
- **Always specify target entities** — when an operation relates to an existing entity, pass its type and ID
- Summarize tool results concisely rather than showing raw output

### Multi-Turn Context
- **Remember previous results** — when the user says "that post", "the first one", "it", refer back to entities from earlier turns
- After listing entities, remember their IDs so you can get details without asking the user to repeat themselves` +
    (pluginInstructions && pluginInstructions.length > 0
      ? `\n\n### Plugin-Specific Behavior (MANDATORY)\n\n${pluginInstructions.join("\n\n")}`
      : "") +
    `

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
- If you don't know something, say so concisely`
  );
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
  const { model, webSearch, temperature, maxTokens, messageBus } = options;

  // Create event emitter backed by message bus
  const emitter = createMessageBusEmitter(messageBus);

  return function createBrainAgent(config: BrainAgentConfig): BrainAgent {
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
            config.pluginInstructions,
            config.profile,
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

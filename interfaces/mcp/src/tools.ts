import {
  defineTool,
  z,
  type ServiceToolDefinition,
  type ToolAgentAnswer,
} from "@brains/sdk/interfaces";
import { readYourWrites, readYourWritesHandleSchema } from "./read-your-writes";

/**
 * What one turn reports back.
 *
 * The prose is the answer; the handles are so a client can read back what
 * the turn just wrote instead of searching for it.
 */
const turnOutput = z.object({
  text: z.string(),
  conversationId: z.string(),
  toolResults: z.array(z.unknown()).optional(),
  readYourWrites: z.array(readYourWritesHandleSchema).optional(),
});

function turn(
  answer: Extract<ToolAgentAnswer, { asked?: undefined }>,
  conversationId: string,
): z.input<typeof turnOutput> {
  const handles = readYourWrites(answer.toolResults);
  return {
    text: answer.text,
    conversationId,
    ...(answer.toolResults.length > 0
      ? { toolResults: [...answer.toolResults] }
      : {}),
    ...(handles.length > 0 ? { readYourWrites: handles } : {}),
  };
}

/**
 * The two tools that are the conversation.
 *
 * Every other tool an MCP client sees belongs to some other package; these
 * are the way in. `chat` puts a message to the brain, `confirm` answers a
 * question the brain asked back, and both hand on whatever comes back
 * without deciding what it means.
 *
 * `agentTool: false` on both is required rather than decorative: the runtime
 * only reaches the brain from a tool the brain cannot call, because the agent
 * calling a tool that calls the agent is a loop with no base case.
 */
export function createMCPTools(): ServiceToolDefinition[] {
  return [
    defineTool({
      name: "chat",
      description:
        "Talk to the brain to make changes or get reasoned answers. Use this for any create/update/delete request or questions requiring reasoning across content. For simple lookups, use search/get/list directly.",
      input: z.object({
        message: z.string().min(1),
        conversationId: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Opaque conversation handle returned by a previous chat call. Omit it to start a new isolated conversation.",
          ),
      }),
      output: turnOutput,
      permission: "public",
      sideEffects: "writes",
      agentTool: false,
      // `chat` writes, and a client with no way to call it has no way in.
      directMcpExposure: "basic",
      execute: async ({ input, agent, signal }) => {
        const conversationId =
          input.conversationId ?? `conversation-${crypto.randomUUID()}`;
        const answer = await agent.chat({
          conversationId,
          message: input.message,
          signal,
        });
        // The brain asked something back: hand the question on rather than
        // reporting the empty answer that came with it.
        if (answer.asked) return answer.asked;
        return turn(answer, conversationId);
      },
    }),
    defineTool({
      name: "confirm",
      description:
        "Resolve a pending confirmation returned by chat. Use this only after chat returns needsConfirmation with an approvalId.",
      input: z.object({
        approvalId: z.string().min(1),
        confirmed: z.boolean(),
        conversationId: z
          .string()
          .min(1)
          .describe(
            "Exact conversation handle returned by the chat confirmation.",
          ),
      }),
      output: turnOutput,
      permission: "public",
      sideEffects: "writes",
      agentTool: false,
      directMcpExposure: "basic",
      execute: async ({ input, agent, signal }) => {
        // Answering one question can raise the next; forward that too.
        const answer = await agent.resolve({
          conversationId: input.conversationId,
          approvalId: input.approvalId,
          confirmed: input.confirmed,
          signal,
        });
        if (answer.asked) return answer.asked;
        return turn(answer, input.conversationId);
      },
    }),
  ];
}

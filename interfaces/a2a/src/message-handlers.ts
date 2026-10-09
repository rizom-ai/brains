import {
  internalFullScope,
  type InterfacePluginContext,
} from "@brains/plugins";
import { A2A_CHANNELS, SourceCitationSchema } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import { getErrorMessage } from "@brains/utils/error";
import { executeAgentCall, type A2AClientDeps } from "./client";

const networkAskMessageSchema = z.object({
  agent: z.string().trim().min(1).max(253),
  question: z.string().trim().min(1).max(4_000),
});

/** What a peer's answer gives the asking brain: its text and its citations. */
const peerAnswerSchema = z.object({
  state: z.string(),
  response: z.string(),
  sources: z.array(SourceCitationSchema),
});

export interface A2AMessageHandlerOptions {
  /** The whole budget for one peer: Agent Card fetch and answer, one attempt. */
  networkAskTimeoutMs: number;
}

const askAgentMessageSchema = z.object({
  agent: z.string().trim().min(1).max(253),
  instruction: z.string().trim().min(1).max(2_000),
  selection: z.string().min(1).max(8_000),
});

export interface A2ADirectoryAgent {
  id: string;
  label: string;
}

/**
 * Register the in-process A2A surface used by packages that must not depend
 * on this interface directly. Calls use the exact outbound validation,
 * Agent Card verification, signing, and network path as agent_call, but are
 * restricted to saved approved agents.
 */
export function registerA2ACallMessageHandlers(
  context: InterfacePluginContext,
  deps: A2AClientDeps,
  options: A2AMessageHandlerOptions = { networkAskTimeoutMs: 6_000 },
): void {
  context.messaging.subscribe(A2A_CHANNELS.askRequest, async (message) => {
    const parsed = networkAskMessageSchema.safeParse(message.payload);
    if (!parsed.success) {
      return { success: false, error: "Invalid network ask request" };
    }
    const { agent, question } = parsed.data;
    const budgetMs = options.networkAskTimeoutMs;
    const budget = AbortSignal.timeout(budgetMs);
    const timedOut = {
      success: false,
      error: `${agent} did not answer within ${budgetMs} ms`,
    };
    try {
      const result = await executeAgentCall(
        { agent, message: question },
        { ...deps, maxNetworkAttempts: 1 },
        { requireSaved: true, signal: budget },
      );
      if (budget.aborted) return timedOut;
      if ("success" in result && result.success === true) {
        const answer = peerAnswerSchema.safeParse(result.data);
        return answer.success
          ? { success: true, data: answer.data }
          : { success: false, error: `${agent} gave no readable answer` };
      }
      return {
        success: false,
        error: "error" in result ? result.error : `${agent} did not answer`,
      };
    } catch (error) {
      if (budget.aborted) return timedOut;
      return {
        success: false,
        error: getErrorMessage(error, `${agent} did not answer`),
      };
    }
  });

  context.messaging.subscribe(A2A_CHANNELS.callRequest, async (message) => {
    const parsed = askAgentMessageSchema.safeParse(message.payload);
    if (!parsed.success) {
      return { success: false, error: "Invalid A2A call request" };
    }

    const { agent, instruction, selection } = parsed.data;
    const result = await executeAgentCall(
      {
        agent,
        message: [
          "A Studio author is asking about selected markdown.",
          `Instruction: ${instruction}`,
          "",
          "Selected markdown:",
          selection,
        ].join("\n"),
      },
      deps,
      { requireSaved: true },
    );

    if ("success" in result && result.success === true) {
      return { success: true, data: result.data };
    }
    return {
      success: false,
      error: "error" in result ? result.error : "Agent call failed",
    };
  });

  context.messaging.subscribe(A2A_CHANNELS.callAgents, async () => {
    if (!context.entityService.hasEntityType("agent")) {
      return { success: true, data: { agents: [] } };
    }

    const entities = await context.entityService.listEntities({
      entityType: "agent",
      options: {
        filter: {
          visibilityScope: internalFullScope(
            "Admin Studio lists approved A2A contacts at any visibility",
          ),
        },
      },
    });
    const agents: A2ADirectoryAgent[] = entities
      .filter((entity) => entity.metadata["status"] === "approved")
      .map((entity) => {
        const name = entity.metadata["name"];
        return {
          id: entity.id,
          label: typeof name === "string" && name.length > 0 ? name : entity.id,
        };
      })
      .sort((left, right) => left.label.localeCompare(right.label));

    return { success: true, data: { agents } };
  });
}

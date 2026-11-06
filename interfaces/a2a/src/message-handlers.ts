import {
  internalFullScope,
  type InterfacePluginContext,
} from "@brains/plugins";
import {
  a2aAgentsContract,
  a2aAskContract,
  a2aCallContract,
  a2aPeerAnswerSchema,
  type A2ADirectoryAgent,
  type A2APeerAnswer,
} from "@brains/contracts";
import { getErrorMessage } from "@brains/utils/error";
import { executeAgentCall, type A2AClientDeps } from "./client";

/** How a peer is asked: the question, then what kind of answer serves a visitor. */
export function networkAskMessage(question: string): string {
  return [
    question,
    "",
    "Asked on behalf of a visitor to another brain's site. Answer briefly, from your own public content, and cite what you draw on.",
  ].join("\n");
}

export interface A2AMessageHandlerOptions {
  /** The whole budget for one peer: Agent Card fetch and answer, one attempt. */
  networkAskTimeoutMs: number;
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
  options: A2AMessageHandlerOptions = { networkAskTimeoutMs: 30_000 },
): void {
  context.messaging.answer(
    a2aAskContract,
    async ({ agent, question }): Promise<A2APeerAnswer> => {
      const budgetMs = options.networkAskTimeoutMs;
      const budget = AbortSignal.timeout(budgetMs);
      const timedOut = `${agent} did not answer within ${budgetMs} ms`;
      let result: Awaited<ReturnType<typeof executeAgentCall>>;
      try {
        result = await executeAgentCall(
          { agent, message: networkAskMessage(question) },
          { ...deps, maxNetworkAttempts: 1 },
          { requireSaved: true, signal: budget },
        );
      } catch (error) {
        throw new Error(
          budget.aborted
            ? timedOut
            : getErrorMessage(error, `${agent} did not answer`),
          { cause: error },
        );
      }
      if (budget.aborted) throw new Error(timedOut);
      if (!("success" in result) || result.success !== true) {
        throw new Error(
          "error" in result ? result.error : `${agent} did not answer`,
        );
      }
      const answer = a2aPeerAnswerSchema.safeParse(result.data);
      if (!answer.success) throw new Error(`${agent} gave no readable answer`);
      if (answer.data.state !== "completed") {
        throw new Error(`${agent} did not answer: ${answer.data.response}`);
      }
      return answer.data;
    },
  );

  context.messaging.answer(
    a2aCallContract,
    async ({ agent, instruction, selection }): Promise<A2APeerAnswer> => {
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
      if (!("success" in result) || result.success !== true) {
        throw new Error("error" in result ? result.error : "Agent call failed");
      }
      const answer = a2aPeerAnswerSchema.safeParse(result.data);
      if (!answer.success) throw new Error("Invalid response from agent");
      return answer.data;
    },
  );

  context.messaging.answer(a2aAgentsContract, async () => {
    if (!context.entityService.hasEntityType("agent")) return { agents: [] };

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

    return { agents };
  });
}

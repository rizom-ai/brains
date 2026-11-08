import {
  permissionToVisibilityScope,
  type InterfacePluginContext,
} from "@brains/plugins";
import {
  SdkError,
  a2aAgentsContract,
  a2aAskContract,
  a2aCallContract,
  a2aPeerAnswerSchema,
  clipPublicMessage,
  type A2ADirectoryAgent,
  type A2APeerAnswer,
} from "@brains/contracts";
import { getErrorMessage } from "@brains/utils/error";
import { executeAgentCall, type A2AClientDeps } from "./client";

/** The directory's refusals to contact an agent, before any network contact. */
const directoryRefusals = new Set([
  "agent_not_saved",
  "agent_not_approved",
  "agent_archived",
]);

/**
 * An outbound call that did not succeed, as the asker hears it. Its message
 * is written for the caller, as agent_call returns it: a refusal by the
 * directory is `permission_denied`, anything else a failed call.
 */
function callRefusal(
  result: Awaited<ReturnType<typeof executeAgentCall>>,
  fallback: string,
): SdkError {
  const code =
    "code" in result && directoryRefusals.has(result.code ?? "")
      ? "permission_denied"
      : "handler_failed";
  const message = "error" in result ? result.error : fallback;
  return new SdkError(code, { publicMessage: clipPublicMessage(message) });
}

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
 * restricted to saved approved agents the requester can see: a Studio call
 * and the agent list carry the author's level, and a network ask, which
 * carries none, sees agents saved public, the peers network_ask picks.
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
      const timedOut = (cause?: unknown): SdkError =>
        new SdkError("deadline_exceeded", {
          publicMessage: `${agent} did not answer within ${budgetMs} ms`,
          cause,
        });
      let result: Awaited<ReturnType<typeof executeAgentCall>>;
      try {
        result = await executeAgentCall(
          { agent, message: networkAskMessage(question) },
          { ...deps, maxNetworkAttempts: 1 },
          { requireSaved: true, signal: budget },
        );
      } catch (error) {
        if (budget.aborted) throw timedOut(error);
        throw new SdkError("handler_failed", {
          message: getErrorMessage(error, `${agent} did not answer`),
          publicMessage: `${agent} did not answer`,
          cause: error,
        });
      }
      if (budget.aborted) throw timedOut();
      if (!("success" in result) || result.success !== true) {
        throw callRefusal(result, `${agent} did not answer`);
      }
      const answer = a2aPeerAnswerSchema.safeParse(result.data);
      if (!answer.success) {
        throw new SdkError("handler_failed", {
          publicMessage: `${agent} gave no readable answer`,
        });
      }
      if (answer.data.state !== "completed") {
        // The peer's own words, written for whoever asked.
        throw new SdkError("handler_failed", {
          publicMessage: clipPublicMessage(
            `${agent} did not answer: ${answer.data.response}`,
          ),
        });
      }
      return answer.data;
    },
  );

  context.messaging.answer(
    a2aCallContract,
    async ({
      agent,
      instruction,
      selection,
      userPermissionLevel,
    }): Promise<A2APeerAnswer> => {
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
        { requireSaved: true, userPermissionLevel },
      );
      if (!("success" in result) || result.success !== true) {
        throw callRefusal(result, "Agent call failed");
      }
      const answer = a2aPeerAnswerSchema.safeParse(result.data);
      if (!answer.success) {
        throw new SdkError("handler_failed", {
          publicMessage: "Invalid response from agent",
        });
      }
      return answer.data;
    },
  );

  context.messaging.answer(
    a2aAgentsContract,
    async ({ userPermissionLevel }) => {
      if (!context.entityService.hasEntityType("agent")) return { agents: [] };

      // The agents a Studio author may ask: the ones a2a:call:request
      // resolves for the same level.
      const entities = await context.entityService.listEntities({
        entityType: "agent",
        options: {
          filter: {
            visibilityScope: permissionToVisibilityScope(userPermissionLevel),
          },
        },
      });
      const agents: A2ADirectoryAgent[] = entities
        .filter((entity) => entity.metadata["status"] === "approved")
        .map((entity) => {
          const name = entity.metadata["name"];
          return {
            id: entity.id,
            label:
              typeof name === "string" && name.length > 0 ? name : entity.id,
          };
        })
        .sort((left, right) => left.label.localeCompare(right.label));

      return { agents };
    },
  );
}

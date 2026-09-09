import { A2A_CHANNELS } from "@brains/contracts";
import {
  defineSubscription,
  SdkError,
  z,
  type AnySubscriptionDefinition,
} from "@brains/sdk/interfaces";
import { executeAgentCall, type A2AClientDeps } from "./client";

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
 * The in-process A2A surface for packages that must not depend on this
 * interface directly: Studio asks which approved agents can be reached, and
 * asks one of them about a selection. Calls use the exact outbound
 * validation, Agent Card verification, signing, and network path as the
 * call tool, restricted to saved approved agents.
 */
export function a2aSubscriptions(
  deps: A2AClientDeps,
): AnySubscriptionDefinition[] {
  return [
    defineSubscription({
      topic: A2A_CHANNELS.callRequest,
      payload: askAgentMessageSchema.loose(),
      handle: async ({ payload }) => {
        const { agent, instruction, selection } = payload;
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
        if (!result.success) {
          if (result.code === "agent_not_saved")
            throw new SdkError("not_found", { publicMessage: result.error });
          if (
            result.code === "agent_archived" ||
            result.code === "agent_not_approved"
          )
            throw new SdkError("permission_denied", {
              publicMessage: result.error,
            });
          throw new Error(result.error);
        }
        return result.data;
      },
    }),
    defineSubscription({
      topic: A2A_CHANNELS.callAgents,
      payload: z.unknown(),
      handle: async ({ entities }) => {
        if (!entities.getEntityTypes().includes("agent")) {
          return { agents: [] };
        }
        const saved = await entities.listEntities({
          entityType: "agent",
          options: {
            // Admin Studio lists approved A2A contacts at any visibility.
            filter: { visibilityScope: "restricted" },
          },
        });
        const agents: A2ADirectoryAgent[] = saved
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
    }),
  ];
}

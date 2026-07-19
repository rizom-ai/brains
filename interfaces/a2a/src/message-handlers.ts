import {
  internalFullScope,
  type InterfacePluginContext,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
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
 * Register the in-process A2A surface used by packages that must not depend
 * on this interface directly. Calls use the exact outbound validation,
 * Agent Card verification, signing, and network path as agent_call, but are
 * restricted to saved approved agents.
 */
export function registerA2ACallMessageHandlers(
  context: InterfacePluginContext,
  deps: A2AClientDeps,
): void {
  context.messaging.subscribe("a2a:call:request", async (message) => {
    const parsed = askAgentMessageSchema.safeParse(message.payload);
    if (!parsed.success) {
      return { success: false, error: "Invalid A2A call request" };
    }

    const { agent, instruction, selection } = parsed.data;
    const result = await executeAgentCall(
      {
        agent,
        message: [
          "A CMS author is asking about selected markdown.",
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

  context.messaging.subscribe("a2a:call:agents", async () => {
    if (!context.entityService.hasEntityType("agent")) {
      return { success: true, data: { agents: [] } };
    }

    const entities = await context.entityService.listEntities({
      entityType: "agent",
      options: {
        filter: {
          visibilityScope: internalFullScope(
            "Admin CMS lists approved A2A contacts at any visibility",
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

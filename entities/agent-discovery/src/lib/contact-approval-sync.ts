import {
  SYSTEM_CHANNELS,
  entityCreatedChannel,
  entityUpdatedChannel,
  internalFullScope,
  type ServiceRuntime,
} from "@brains/sdk/internal/service-runtime";
import { z } from "@brains/utils/zod";
import { agentEntitySchema, type AgentEntity } from "../schemas/agent";
import type { AgentContext } from "./agent-context";
import { parseAgentEntity, rewriteAgentContent } from "./agent-content";
import { AGENT_ENTITY_TYPE } from "./constants";
import type { ContactApprovals } from "./contact-approvals";

const everyAgent = internalFullScope(
  "contact approvals are kept for agents saved at any visibility",
);

const carriedOverSchema = z.object({ at: z.string() });
const CARRIED_OVER_KEY = "carried-over";

type SyncContext = Pick<AgentContext, "entityService" | "runtimeState">;

/**
 * Approve the peers a brain had approved while approval was an agent's
 * `status`, once: the first time startup content is in place after the move.
 * From then on an entry's status approves nobody.
 */
async function carryOverApprovals(
  context: SyncContext,
  approvals: ContactApprovals,
): Promise<void> {
  const marker = context.runtimeState.scoped({
    namespace: "agent-discovery.contact-approval-move",
    schema: carriedOverSchema,
  });
  if (await marker.has(CARRIED_OVER_KEY)) return;
  const agents = await context.entityService.listEntities(
    {
      entityType: AGENT_ENTITY_TYPE,
      options: { filter: { visibilityScope: everyAgent } },
    },
    agentEntitySchema,
  );
  for (const agent of agents) {
    if (agent.metadata.status === "approved") await approvals.approve(agent.id);
  }
  await marker.set(CARRIED_OVER_KEY, { at: new Date().toISOString() });
}

/**
 * Make an entry say what is true: one that claims an approval nobody gave
 * goes back to discovered. The other way is left alone, since an entry
 * that says less than the approval only takes contact away.
 */
async function showTrueStanding(
  context: SyncContext,
  approvals: ContactApprovals,
  agent: AgentEntity,
): Promise<void> {
  if (agent.metadata.status !== "approved") return;
  if (await approvals.isApproved(agent.id)) return;
  await context.entityService.updateEntity({
    entity: {
      ...agent,
      content: rewriteAgentContent(parseAgentEntity(agent), {
        status: "discovered",
      }),
      metadata: { ...agent.metadata, status: "discovered" },
    },
    options: { expectedContentHash: agent.contentHash },
  });
}

/**
 * Keep the agent directory's entries honest about who the brain may
 * contact: carry earlier approvals over once, then correct any entry that
 * claims one, at startup and whenever an agent is written.
 */
export function registerContactApprovalSync(
  runtime: Pick<ServiceRuntime, "listen">,
  context: SyncContext,
  approvals: ContactApprovals,
): void {
  const readAgent = (id: string): Promise<AgentEntity | null> =>
    context.entityService.getEntity(
      { entityType: AGENT_ENTITY_TYPE, id, visibilityScope: everyAgent },
      agentEntitySchema,
    );

  runtime.listen(SYSTEM_CHANNELS.startupContentSettled, async () => {
    await carryOverApprovals(context, approvals);
    const agents = await context.entityService.listEntities(
      {
        entityType: AGENT_ENTITY_TYPE,
        options: { filter: { visibilityScope: everyAgent } },
      },
      agentEntitySchema,
    );
    for (const agent of agents) {
      await showTrueStanding(context, approvals, agent);
    }
  });

  for (const channel of [entityCreatedChannel, entityUpdatedChannel]) {
    // Every process writes agents; the main one corrects what any wrote.
    runtime.listen(
      channel,
      async ({ payload }) => {
        if (payload.entityType !== AGENT_ENTITY_TYPE) return;
        const agent = await readAgent(payload.entityId);
        if (agent) await showTrueStanding(context, approvals, agent);
      },
      { mode: "observe" },
    );
  }
}

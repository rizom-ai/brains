import {
  SdkError,
  a2aTurnContract,
  type A2APeerAnswer,
} from "@brains/contracts";
import {
  defineServicePlugin,
  z,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import {
  serviceRuntime,
  withJobHandlers,
  withTools,
  type ServiceRuntime,
} from "@brains/sdk/internal/service-runtime";
import {
  seminarHoldJob,
  type SeminarHoldDeps,
  type SeminarPeer,
} from "./handlers/seminar-hold-handler";
import { modelChair } from "./lib/chair";
import { seminar } from "./seminar-entity";
import { createSeminarHoldTool } from "./tools/seminar-hold";

export const seminarConfigSchema: z.ZodObject<{
  guidance: z.ZodOptional<z.ZodString>;
}> = z.object({
  /**
   * What the chair knows of its peers that their openings do not say, such
   * as the works a peer's brain does not hold, so it never points him there.
   */
  guidance: z.string().trim().min(1).optional(),
});

export type SeminarConfig = z.output<typeof seminarConfigSchema>;

const AGENT_ENTITY_TYPE = "agent";

const approvedPeerSchema = z.object({
  id: z.string().min(1),
  metadata: z.object({ name: z.string().min(1) }),
});

/** What holding a seminar needs, over the package's runtime. */
function holdDeps(
  runtime: ServiceRuntime,
  config: SeminarConfig,
): SeminarHoldDeps {
  return {
    chair: modelChair(runtime.ai, config.guidance),
    peers: async (): Promise<SeminarPeer[]> => {
      if (!runtime.entityReads.hasEntityType(AGENT_ENTITY_TYPE)) return [];
      const agents = await runtime.entityReads.listEntities({
        entityType: AGENT_ENTITY_TYPE,
        options: { filter: { metadata: { status: "approved" } } },
      });
      return agents.map((agent) => {
        const { id, metadata } = approvedPeerSchema.parse(agent);
        return { id, name: metadata.name };
      });
    },
    // A turn goes out through the A2A interface, which owns the contract:
    // saved, approved peers only, one attempt, within the turn budget.
    askTurn: async (agent, message): Promise<A2APeerAnswer> => {
      const reply = await runtime.messaging.request(a2aTurnContract, {
        agent,
        message,
      });
      if (reply.status === "answered") return reply.data;
      if (reply.status === "failed") {
        throw new SdkError(reply.error.code, {
          publicMessage: reply.error.message,
        });
      }
      throw new SdkError("handler_failed", {
        publicMessage: "This brain cannot reach other brains",
      });
    },
    exists: async (id) =>
      (await runtime.entityReads.getEntity({
        entityType: seminar.type,
        id,
      })) !== null,
    create: async (entity) =>
      (await runtime.entityWrites.createEntity({ entity })).entityId,
    today: () => new Date().toISOString().slice(0, 10),
  };
}

/**
 * Seminars: the owner puts one question to every approved peer; the chair
 * reads their openings and decides who stands, the others answer him and he
 * answers them. Every peer's turn is kept verbatim, with its sources, as a
 * draft the owner reads and publishes. Installed under seminar, so its tool is
 * seminar_hold and its job seminar:hold; its type installs apart.
 */
export const seminarPackage: ServicePackageDefinition<
  typeof seminarConfigSchema
> = withTools(
  withJobHandlers(
    defineServicePlugin({
      id: "seminars",
      config: seminarConfigSchema,
      entities: [seminar],
      setup: (): Record<never, never> => ({}),
    }),
    (context) => [
      seminarHoldJob(holdDeps(serviceRuntime(context), context.config)),
    ],
  ),
  (context) => [
    createSeminarHoldTool("seminar", { jobs: serviceRuntime(context).jobs }),
  ],
);

export default seminarPackage;

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
  type SeminarTurnDeps,
} from "./handlers/seminar-hold-handler";
import {
  seminarRedoJob,
  type SeminarRedoDeps,
  type StoredSeminar,
} from "./handlers/seminar-redo-handler";
import { seminarDataSource } from "./datasources/seminar-datasource";
import { modelChair } from "./lib/chair";
import { getTemplates } from "./lib/register-templates";
import { seminarSchema } from "./schemas/seminar";
import { seminar } from "./seminar-entity";
import { getErrorMessage } from "@brains/utils/error";
import { createSeminarHoldTool } from "./tools/seminar-hold";

export const seminarConfigSchema: z.ZodObject<{
  guidance: z.ZodOptional<z.ZodString>;
  peers: z.ZodDefault<
    z.ZodArray<z.ZodObject<{ agent: z.ZodString; name: z.ZodString }>>
  >;
}> = z.object({
  /**
   * What the chair knows of its peers that their openings do not say, such
   * as the works a peer's brain does not hold, so it never points him there.
   */
  guidance: z.string().trim().min(1).optional(),
  /**
   * The peers as the brain's pages show them: each under the name given
   * here, in this order. A peer not listed keeps the name it gives itself
   * and follows the listed ones.
   */
  peers: z
    .array(
      z.object({
        agent: z.string().trim().min(1),
        name: z.string().trim().min(1),
      }),
    )
    .default([]),
});

export type SeminarConfig = z.output<typeof seminarConfigSchema>;

const AGENT_ENTITY_TYPE = "agent";

const approvedPeerSchema = z.object({
  id: z.string().min(1),
  metadata: z.object({ name: z.string().min(1) }),
});

/** What taking a turn needs, over the package's runtime. */
function turnDeps(
  runtime: ServiceRuntime,
  config: SeminarConfig,
): SeminarTurnDeps {
  return {
    chair: modelChair(runtime.ai, config.guidance),
    warn: (message, error): void => {
      runtime.logger.warn(message, { error: getErrorMessage(error) });
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
  };
}

/** What redoing a seminar needs: the stored draft, read and written as the package. */
function redoDeps(
  runtime: ServiceRuntime,
  config: SeminarConfig,
): SeminarRedoDeps {
  const stored = (
    id: string,
  ): ReturnType<ServiceRuntime["entityReads"]["getEntity"]> =>
    runtime.entityReads.getEntity({ entityType: seminar.type, id });
  return {
    ...turnDeps(runtime, config),
    load: async (id): Promise<StoredSeminar | null> => {
      const entity = await stored(id);
      if (!entity) return null;
      const { content, metadata } = seminarSchema.parse(entity);
      return { id: entity.id, entityType: seminar.type, content, metadata };
    },
    save: async ({ id, content, metadata }): Promise<void> => {
      const entity = await stored(id);
      if (!entity) throw new Error(`No seminar ${id}`);
      await runtime.entityWrites.updateEntity({
        entity: { ...entity, content, metadata },
      });
    },
  };
}

/** What holding a seminar needs, over the package's runtime. */
function holdDeps(
  runtime: ServiceRuntime,
  config: SeminarConfig,
): SeminarHoldDeps {
  return {
    ...turnDeps(runtime, config),
    peers: async (): Promise<SeminarPeer[]> => {
      if (!runtime.entityReads.hasEntityType(AGENT_ENTITY_TYPE)) return [];
      const agents = await runtime.entityReads.listEntities({
        entityType: AGENT_ENTITY_TYPE,
        options: { filter: { metadata: { status: "approved" } } },
      });
      // Under the name this brain shows a peer by, where it gives one: the
      // chair then writes of Marx, not of the brain named Karl.
      return agents.map((agent) => {
        const { id, metadata } = approvedPeerSchema.parse(agent);
        const shown = config.peers.find((peer) => peer.agent === id)?.name;
        return { id, name: shown ?? metadata.name };
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
 * draft the owner reads and publishes; a draft is redone from the chair's
 * turn or from its closing. Installed under seminar, so its tool is
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
      setup: (context): Record<never, never> => {
        const runtime = serviceRuntime(context);
        for (const [name, template] of Object.entries(getTemplates())) {
          runtime.template(name, template);
        }
        // What those pages read, as seminar:entities.
        runtime.dataSource(seminarDataSource(seminar, context.config.peers));
        return {};
      },
    }),
    (context) => [
      seminarHoldJob(holdDeps(serviceRuntime(context), context.config)),
      seminarRedoJob(redoDeps(serviceRuntime(context), context.config)),
    ],
  ),
  (context) => [
    createSeminarHoldTool("seminar", { jobs: serviceRuntime(context).jobs }),
  ],
);

export default seminarPackage;

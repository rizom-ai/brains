import {
  agentEntity,
  agentFrontmatterSchema,
  agentSkillSchema,
  createAgentContent,
  createSkillContent,
  skill,
  skillFrontmatterSchema,
} from "@brains/agent-discovery";
import {
  defineServicePlugin,
  z,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import {
  serviceRuntime,
  type ServiceRuntime,
} from "@brains/sdk/internal/service-runtime";
import { generateIdFromText, slugifyUrl } from "@brains/utils/string-utils";
import { swotDefinition, swotWritten } from "../swot-entity";
import {
  SWOT_DERIVATION_RULE_ID,
  createSwotProjectionRule,
} from "../lib/swot-projection";

/** An agent a test case seeds: its saved frontmatter and body sections. */
const swotEvalAgentSchema = agentFrontmatterSchema.extend({
  id: z.string().optional(),
  discoveredAt: agentFrontmatterSchema.shape.discoveredAt.optional(),
  about: z.string(),
  skills: z.array(agentSkillSchema),
  notes: z.string().default(""),
});

const swotEvalInputSchema = z.object({
  skills: z.array(skillFrontmatterSchema),
  agents: z.array(swotEvalAgentSchema),
});

type EvalRuntime = Pick<
  ServiceRuntime,
  "entityReads" | "entityWrites" | "runProjectionRule"
>;

/** Every record of a type, removed, so a test case starts from its own. */
async function deleteAllEntities(
  runtime: EvalRuntime,
  entityType: string,
): Promise<void> {
  const entities = await runtime.entityReads.listEntities({
    entityType,
    options: { limit: 1000 },
  });
  await Promise.all(
    entities.map((entity) =>
      runtime.entityWrites.deleteEntity({ entityType, id: entity.id }),
    ),
  );
}

/** A document written as its type's adapter reads it, as an import is. */
async function createFromMarkdown(
  runtime: EvalRuntime,
  input: { entityType: string; id: string; markdown: string },
): Promise<void> {
  const parsed = runtime.entityReads.deserializeEntity(
    input.markdown,
    input.entityType,
  );
  await runtime.entityWrites.createEntity({
    entity: {
      ...parsed,
      id: input.id,
      entityType: input.entityType,
      content: input.markdown,
      metadata: parsed.metadata ?? {},
    },
  });
}

/**
 * Replace the directory with a test case's: each skill and agent is written
 * as agent-discovery writes it and read back through its type.
 */
async function seedSwotEvalEntities(
  runtime: EvalRuntime,
  input: z.output<typeof swotEvalInputSchema>,
): Promise<void> {
  await deleteAllEntities(runtime, "swot");
  await deleteAllEntities(runtime, "agent");
  await deleteAllEntities(runtime, "skill");

  await Promise.all(
    input.skills.map((seeded) =>
      createFromMarkdown(runtime, {
        entityType: "skill",
        id: generateIdFromText(seeded.name),
        markdown: createSkillContent(seeded),
      }),
    ),
  );
  await Promise.all(
    input.agents.map(({ id, discoveredAt, ...agent }) =>
      createFromMarkdown(runtime, {
        entityType: "agent",
        id: id ?? slugifyUrl(agent.url),
        markdown: createAgentContent({
          ...agent,
          discoveredAt: discoveredAt ?? new Date().toISOString(),
        }),
      }),
    ),
  );
}

const emptyConfigSchema: z.ZodObject<Record<string, never>> = z.object({});

/**
 * The SWOT type beside agent-discovery's own agent and skill types, with a
 * `deriveSwot` eval handler that seeds a test case's directory and measures
 * the production swot-derivation rule against it. Its id is the one the
 * test cases address (`plugin: assessment`). The rule here names no
 * sources, so seeding queues no derivation: only the eval runs it.
 *
 * Eval-only: served from `@brains/assessment/eval`, which `evals/eval.yaml`
 * names, and never from the package entry production brains load.
 */
const swotEvalPackage: ServicePackageDefinition<typeof emptyConfigSchema> =
  defineServicePlugin({
    id: "assessment",
    config: emptyConfigSchema,
    entities: [
      swotDefinition(createSwotProjectionRule({ scheduled: false })),
      agentEntity(undefined),
      skill,
    ],
    setup: (setupContext): Record<never, never> => {
      const runtime = serviceRuntime(setupContext);
      runtime.evalHandler("deriveSwot", async (input: unknown) => {
        await seedSwotEvalEntities(runtime, swotEvalInputSchema.parse(input));
        return swotWritten(
          await runtime.runProjectionRule(SWOT_DERIVATION_RULE_ID),
        );
      });
      return {};
    },
  });

export default swotEvalPackage;

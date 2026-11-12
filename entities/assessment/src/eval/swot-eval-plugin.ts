import {
  agentDiscoveryPackage,
  agentFrontmatterSchema,
  agentSkillSchema,
  createAgentContent,
  createSkillContent,
  derivedSkillPackage,
  skillFrontmatterSchema,
} from "@brains/agent-discovery";
import type {
  BaseEntity,
  EntityPluginContext,
  EntityTypeConfig,
  Plugin,
} from "@brains/plugins";
import {
  EntityPlugin,
  emptyEntityPluginConfigSchema,
  instantiatePluginPackageDefinition,
} from "@brains/plugins";
import { CallbackProgressReporter } from "@brains/utils/progress";
import { generateIdFromText, slugifyUrl } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";
import packageJson from "../../package.json";
import { SwotAdapter } from "../adapters/swot-adapter";
import { SwotDerivationHandler } from "../handlers/swot-derivation-handler";
import {
  swotEntitySchema,
  type SwotEntity,
  type SwotFrontmatter,
} from "../schemas/swot";

/** agent-discovery's declared agent and skill types, as its packages install them. */
function directoryTypes(): Array<EntityPlugin<BaseEntity, object, object>> {
  const metadata = { name: "@brains/agent-discovery", version: "eval" };
  return [
    ...instantiatePluginPackageDefinition(agentDiscoveryPackage, {}, metadata, {
      pluginId: "agent-discovery",
      ownedTypePluginId: "agent-entity",
    }),
    ...instantiatePluginPackageDefinition(derivedSkillPackage, {}, metadata, {
      pluginId: "skill",
      ownedTypePluginId: "skill-entity",
    }),
  ].flatMap((plugin) => (plugin instanceof EntityPlugin ? [plugin] : []));
}
const swotAdapter = new SwotAdapter();

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

async function deleteAllEntities(
  context: EntityPluginContext,
  entityType: string,
): Promise<void> {
  const entities = await context.entityService.listEntities({
    entityType: entityType,
    options: {
      limit: 1000,
    },
  });

  await Promise.all(
    entities.map((entity) =>
      context.entityService.deleteEntity({
        entityType: entity.entityType,
        id: entity.id,
      }),
    ),
  );
}

/**
 * Replace the directory with a test case's: each skill and agent is written
 * as agent-discovery writes it and read back through its adapter.
 */
async function seedSwotEvalEntities(
  context: EntityPluginContext,
  input: z.output<typeof swotEvalInputSchema>,
): Promise<void> {
  await deleteAllEntities(context, "swot");
  await deleteAllEntities(context, "agent");
  await deleteAllEntities(context, "skill");

  await Promise.all(
    input.skills.map((skill) =>
      context.entityService.createEntityFromMarkdown({
        input: {
          entityType: "skill",
          id: generateIdFromText(skill.name),
          markdown: createSkillContent(skill),
        },
      }),
    ),
  );

  await Promise.all(
    input.agents.map(({ id, discoveredAt, ...agent }) =>
      context.entityService.createEntityFromMarkdown({
        input: {
          entityType: "agent",
          id: id ?? slugifyUrl(agent.url),
          markdown: createAgentContent({
            ...agent,
            discoveredAt: discoveredAt ?? new Date().toISOString(),
          }),
        },
      }),
    ),
  );
}

async function deriveSwot(
  context: EntityPluginContext,
  input: unknown,
): Promise<SwotFrontmatter> {
  await seedSwotEvalEntities(context, swotEvalInputSchema.parse(input));

  const handler = new SwotDerivationHandler(context.logger, context);
  const progressReporter = CallbackProgressReporter.from(async () => {});
  if (!progressReporter) {
    throw new Error("Expected progress reporter to be created");
  }

  await handler.process(
    { reason: "eval" },
    "eval-swot-derive",
    progressReporter,
  );

  const entity = await context.entityService.getEntity({
    entityType: "swot",
    id: "swot",
  });
  if (!entity) {
    throw new Error("Expected SWOT entity to be created during eval");
  }

  return swotAdapter.parseSwotContent(entity.content).frontmatter;
}

/**
 * The SWOT entity type beside agent-discovery's own agent and skill types,
 * with a `deriveSwot` eval handler that seeds a test case's directory before
 * deriving. Its id is the one the test cases address (`plugin: assessment`).
 *
 * Eval-only: served from `@brains/assessment/eval`, which `evals/eval.yaml`
 * names, and never from the package entry production brains load.
 */
export class SwotEvalPlugin extends EntityPlugin<
  SwotEntity,
  Record<string, never>,
  Record<string, never>
> {
  readonly entityType: SwotEntity["entityType"] = "swot";
  readonly schema: typeof swotEntitySchema = swotEntitySchema;
  readonly adapter: SwotAdapter = swotAdapter;

  constructor() {
    super("assessment", packageJson, {}, emptyEntityPluginConfigSchema);
  }

  protected override getEntityTypeConfig(): EntityTypeConfig | undefined {
    return { classification: "system" };
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    for (const type of directoryTypes()) {
      context.entities.register(type.entityType, type.schema, type.adapter, {
        classification: "system",
      });
    }
    context.eval.registerHandler("deriveSwot", (input: unknown) =>
      deriveSwot(context, input),
    );
  }
}

export function swotEvalPlugin(): Plugin {
  return new SwotEvalPlugin();
}

import type {
  EntityPluginContext,
  IShell,
  Plugin,
  PluginCapabilities,
} from "@brains/plugins";
import { createEntityPluginContext } from "@brains/plugins";
import { ProgressReporter, z } from "@brains/utils";
import packageJson from "../../package.json";
import { AgentAdapter } from "../adapters/agent-adapter";
import { SkillAdapter } from "../adapters/skill-adapter";
import { SwotAdapter } from "../adapters/swot-adapter";
import { SwotDerivationHandler } from "../handlers/swot-derivation-handler";
import {
  agentEntitySchema,
  agentSkillSchema,
  agentStatusSchema,
} from "../schemas/agent";
import { skillEntitySchema, skillFrontmatterSchema } from "../schemas/skill";
import { swotEntitySchema, type SwotFrontmatter } from "../schemas/swot";

const agentAdapter = new AgentAdapter();
const skillAdapter = new SkillAdapter();
const swotAdapter = new SwotAdapter();

const swotEvalInputSchema = z.object({
  skills: z.array(skillFrontmatterSchema),
  agents: z.array(
    z.object({
      id: z.string().optional(),
      name: z.string(),
      kind: z.enum(["professional", "team", "collective"]),
      organization: z.string().optional(),
      brainName: z.string(),
      url: z.string().url(),
      did: z.string().optional(),
      status: agentStatusSchema,
      discoveredAt: z.string().datetime().optional(),
      about: z.string(),
      skills: z.array(agentSkillSchema),
      notes: z.string().default(""),
    }),
  ),
});

async function deleteAllEntities(
  context: EntityPluginContext,
  entityType: string,
): Promise<void> {
  const entities = await context.entityService.listEntities(entityType, {
    limit: 1000,
  });

  await Promise.all(
    entities.map((entity) =>
      context.entityService.deleteEntity(entity.entityType, entity.id),
    ),
  );
}

async function seedSwotEvalEntities(
  context: EntityPluginContext,
  input: z.infer<typeof swotEvalInputSchema>,
): Promise<void> {
  await deleteAllEntities(context, "swot");
  await deleteAllEntities(context, "agent");
  await deleteAllEntities(context, "skill");

  await Promise.all(
    input.skills.map((skill) =>
      context.entityService.createEntity({
        id: skill.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, ""),
        entityType: "skill",
        content: skillAdapter.createSkillContent(skill),
        metadata: skill,
      }),
    ),
  );

  await Promise.all(
    input.agents.map((agent) => {
      const discoveredAt = agent.discoveredAt ?? new Date().toISOString();
      return context.entityService.createEntity({
        id:
          agent.id ??
          agent.url
            .toLowerCase()
            .replace(/^https?:\/\//, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, ""),
        entityType: "agent",
        content: agentAdapter.createAgentContent({
          name: agent.name,
          kind: agent.kind,
          ...(agent.organization ? { organization: agent.organization } : {}),
          brainName: agent.brainName,
          url: agent.url,
          ...(agent.did ? { did: agent.did } : {}),
          status: agent.status,
          discoveredAt,
          about: agent.about,
          skills: agent.skills,
          notes: agent.notes,
        }),
        metadata: {
          name: agent.name,
          url: agent.url,
          status: agent.status,
          slug: agent.url
            .toLowerCase()
            .replace(/^https?:\/\//, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, ""),
        },
      });
    }),
  );
}

async function deriveSwot(
  context: EntityPluginContext,
  input: unknown,
): Promise<SwotFrontmatter> {
  const parsed = swotEvalInputSchema.parse(input);
  await seedSwotEvalEntities(context, parsed);

  const handler = new SwotDerivationHandler(context.logger, context);
  const progressReporter = ProgressReporter.from(async () => {});
  if (!progressReporter) {
    throw new Error("Expected progress reporter to be created");
  }

  await handler.process(
    { reason: "eval" },
    "eval-swot-derive",
    progressReporter,
  );

  const entity = await context.entityService.getEntity("swot", "swot");
  if (!entity) {
    throw new Error("Expected SWOT entity to be created during eval");
  }

  return swotAdapter.parseSwotContent(entity.content).frontmatter;
}

async function registerSwotEvalPlugin(
  shell: IShell,
): Promise<PluginCapabilities> {
  const context = createEntityPluginContext(shell, "agent-discovery");

  context.entities.register("agent", agentEntitySchema, agentAdapter);
  context.entities.register("skill", skillEntitySchema, skillAdapter);
  context.entities.register("swot", swotEntitySchema, swotAdapter);

  context.eval.registerHandler("deriveSwot", async (input: unknown) => {
    return deriveSwot(context, input);
  });

  return {
    tools: [],
    resources: [],
  };
}

export function createSwotEvalPlugin(): Plugin {
  return {
    id: "agent-discovery",
    packageName: packageJson.name,
    version: packageJson.version,
    description: packageJson.description,
    type: "service",
    register: registerSwotEvalPlugin,
  };
}

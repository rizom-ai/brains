import type {
  AgentBody,
  EntityPluginContext,
  IShell,
  Plugin,
  PluginCapabilities,
} from "@brains/plugins";
import {
  BaseEntityAdapter,
  agentBodySkillSchema,
  anchorProfileKindSchema,
  baseEntitySchema,
  createEntityPluginContext,
  formatAgentBody,
} from "@brains/plugins";
import { CallbackProgressReporter } from "@brains/utils/progress";
import { z } from "@brains/utils/zod";
import packageJson from "../../package.json";
import { SwotAdapter } from "../adapters/swot-adapter";
import { SwotDerivationHandler } from "../handlers/swot-derivation-handler";
import { swotEntitySchema, type SwotFrontmatter } from "../schemas/swot";

const swotAdapter = new SwotAdapter();

const evalAgentStatusSchema = z.enum(["discovered", "approved"]);

const evalAgentFrontmatterSchema = z.object({
  name: z.string(),
  kind: anchorProfileKindSchema,
  organization: z.string().optional(),
  brainName: z.string(),
  url: z.string().url(),
  did: z.string().optional(),
  status: evalAgentStatusSchema,
  discoveredAt: z.string().datetime(),
});

const evalAgentEntitySchema = baseEntitySchema.extend({
  entityType: z.literal("agent"),
  metadata: z.object({
    name: z.string(),
    url: z.string().url(),
    status: evalAgentStatusSchema,
    slug: z.string(),
  }),
});

const evalSkillDataSchema = z.object({
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  examples: z.array(z.string()),
});

type EvalSkillData = z.infer<typeof evalSkillDataSchema>;

const evalSkillEntitySchema = baseEntitySchema.extend({
  entityType: z.literal("skill"),
  metadata: evalSkillDataSchema,
});

type EvalAgentFrontmatter = z.infer<typeof evalAgentFrontmatterSchema>;

class EvalAgentAdapter extends BaseEntityAdapter<
  z.infer<typeof evalAgentEntitySchema>,
  z.infer<typeof evalAgentEntitySchema>["metadata"],
  z.infer<typeof evalAgentFrontmatterSchema>
> {
  constructor() {
    super({
      entityType: "agent",
      purpose: "An agent entity used for SWOT evaluation.",
      schema: evalAgentEntitySchema,
      frontmatterSchema: evalAgentFrontmatterSchema,
    });
  }

  public fromMarkdown(
    markdown: string,
  ): Partial<z.infer<typeof evalAgentEntitySchema>> {
    return { content: markdown, entityType: "agent" };
  }

  public createAgentContent(input: EvalAgentFrontmatter & AgentBody): string {
    const body = formatAgentBody({
      about: input.about,
      skills: input.skills,
      notes: input.notes,
    });

    return this.buildMarkdown(body, {
      name: input.name,
      kind: input.kind,
      ...(input.organization ? { organization: input.organization } : {}),
      brainName: input.brainName,
      url: input.url,
      ...(input.did ? { did: input.did } : {}),
      status: input.status,
      discoveredAt: input.discoveredAt,
    });
  }
}

class EvalSkillAdapter extends BaseEntityAdapter<
  z.infer<typeof evalSkillEntitySchema>,
  z.infer<typeof evalSkillEntitySchema>["metadata"]
> {
  constructor() {
    super({
      entityType: "skill",
      purpose: "A skill entity used for SWOT evaluation.",
      schema: evalSkillEntitySchema,
      frontmatterSchema: evalSkillDataSchema,
    });
  }

  public fromMarkdown(
    markdown: string,
  ): Partial<z.infer<typeof evalSkillEntitySchema>> {
    const frontmatter = this.parseFrontMatter(markdown, evalSkillDataSchema);
    return { content: markdown, entityType: "skill", metadata: frontmatter };
  }

  public createSkillContent(input: EvalSkillData): string {
    return this.buildMarkdown("", input);
  }
}

const agentAdapter = new EvalAgentAdapter();
const skillAdapter = new EvalSkillAdapter();

const swotEvalSkillSchema = z.object({
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  examples: z.array(z.string()),
});

const swotEvalInputSchema = z.object({
  skills: z.array(swotEvalSkillSchema),
  agents: z.array(
    z.object({
      id: z.string().optional(),
      name: z.string(),
      kind: anchorProfileKindSchema,
      organization: z.string().optional(),
      brainName: z.string(),
      url: z.url(),
      did: z.string().optional(),
      status: z.enum(["discovered", "approved"]),
      discoveredAt: z.string().datetime().optional(),
      about: z.string(),
      skills: z.array(agentBodySkillSchema),
      notes: z.string().default(""),
    }),
  ),
});

function slugFromUrl(url: string): string {
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

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

async function seedSwotEvalEntities(
  context: EntityPluginContext,
  input: z.output<typeof swotEvalInputSchema>,
): Promise<void> {
  await deleteAllEntities(context, "swot");
  await deleteAllEntities(context, "agent");
  await deleteAllEntities(context, "skill");

  await Promise.all(
    input.skills.map((skill) =>
      context.entityService.createEntity({
        entity: {
          id: skill.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, ""),
          entityType: "skill",
          content: skillAdapter.createSkillContent(skill),
          metadata: skill,
        },
      }),
    ),
  );

  await Promise.all(
    input.agents.map((agent) => {
      const discoveredAt = agent.discoveredAt ?? new Date().toISOString();
      const slug = slugFromUrl(agent.url);
      return context.entityService.createEntity({
        entity: {
          id: agent.id ?? slug,
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
            slug,
          },
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

async function registerSwotEvalPlugin(
  shell: IShell,
): Promise<PluginCapabilities> {
  const context = createEntityPluginContext(shell, "assessment");

  context.entities.register("agent", evalAgentEntitySchema, agentAdapter, {
    classification: "system",
  });
  context.entities.register("skill", evalSkillEntitySchema, skillAdapter, {
    classification: "system",
  });
  context.entities.register("swot", swotEntitySchema, swotAdapter, {
    classification: "system",
  });

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
    id: "assessment",
    packageName: packageJson.name,
    version: packageJson.version,
    description: packageJson.description,
    type: "service",
    register: registerSwotEvalPlugin,
  };
}

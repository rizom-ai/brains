import type {
  EntityPluginContext,
  IShell,
  Plugin,
  PluginCapabilities,
} from "@brains/plugins";
import {
  BaseEntityAdapter,
  baseEntitySchema,
  createEntityPluginContext,
  skillDataSchema,
} from "@brains/plugins";
import { StructuredContentFormatter } from "@brains/content-formatters";
import { ProgressReporter, z } from "@brains/utils";
import packageJson from "../../package.json";
import { SwotAdapter } from "../adapters/swot-adapter";
import { SwotDerivationHandler } from "../handlers/swot-derivation-handler";
import { swotEntitySchema, type SwotFrontmatter } from "../schemas/swot";

const swotAdapter = new SwotAdapter();

const evalAgentSkillSchema = z.object({
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
});

const evalAgentStatusSchema = z.enum(["discovered", "approved"]);

const evalAgentFrontmatterSchema = z.object({
  name: z.string(),
  kind: z.enum(["professional", "team", "collective"]),
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

const evalSkillEntitySchema = baseEntitySchema.extend({
  entityType: z.literal("skill"),
  metadata: skillDataSchema,
});

const evalAgentBodySchema = z.object({
  about: z.string(),
  skills: z.array(evalAgentSkillSchema),
  notes: z.string(),
});

type EvalAgentBody = z.infer<typeof evalAgentBodySchema>;
type EvalAgentFrontmatter = z.infer<typeof evalAgentFrontmatterSchema>;
type EvalAgentSkill = z.infer<typeof evalAgentSkillSchema>;

function formatSkills(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return "";
  const skills = value as EvalAgentSkill[];
  return skills
    .map((skill) => {
      const tags = skill.tags.length > 0 ? ` [${skill.tags.join(", ")}]` : "";
      return `- ${skill.name}: ${skill.description}${tags}`;
    })
    .join("\n");
}

function parseSkills(text: string): EvalAgentSkill[] {
  if (!text.trim()) return [];
  return text
    .split("\n")
    .map((line) => line.match(/^- (.+?): (.+?)(?:\s+\[(.+?)\])?$/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => ({
      name: match[1] ?? "",
      description: match[2] ?? "",
      tags: match[3]
        ? match[3]
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        : [],
    }));
}

const agentBodyFormatter = new StructuredContentFormatter<EvalAgentBody>(
  evalAgentBodySchema,
  {
    title: "Agent",
    mappings: [
      { key: "about", label: "About", type: "string" },
      {
        key: "skills",
        label: "Skills",
        type: "custom",
        formatter: formatSkills,
        parser: parseSkills,
      },
      { key: "notes", label: "Notes", type: "string" },
    ],
  },
);

class EvalAgentAdapter extends BaseEntityAdapter<
  z.infer<typeof evalAgentEntitySchema>,
  z.infer<typeof evalAgentEntitySchema>["metadata"]
> {
  constructor() {
    super({
      entityType: "agent",
      schema: evalAgentEntitySchema,
      frontmatterSchema: evalAgentFrontmatterSchema,
    });
  }

  public fromMarkdown(
    markdown: string,
  ): Partial<z.infer<typeof evalAgentEntitySchema>> {
    return { content: markdown, entityType: "agent" };
  }

  public createAgentContent(
    input: EvalAgentFrontmatter & EvalAgentBody,
  ): string {
    const body = agentBodyFormatter.format({
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
      schema: evalSkillEntitySchema,
      frontmatterSchema: skillDataSchema,
    });
  }

  public fromMarkdown(
    markdown: string,
  ): Partial<z.infer<typeof evalSkillEntitySchema>> {
    const frontmatter = this.parseFrontMatter(markdown, skillDataSchema);
    return { content: markdown, entityType: "skill", metadata: frontmatter };
  }

  public createSkillContent(input: z.infer<typeof skillDataSchema>): string {
    return this.buildMarkdown("", input);
  }
}

const agentAdapter = new EvalAgentAdapter();
const skillAdapter = new EvalSkillAdapter();

const swotEvalInputSchema = z.object({
  skills: z.array(skillDataSchema),
  agents: z.array(
    z.object({
      id: z.string().optional(),
      name: z.string(),
      kind: z.enum(["professional", "team", "collective"]),
      organization: z.string().optional(),
      brainName: z.string(),
      url: z.string().url(),
      did: z.string().optional(),
      status: evalAgentStatusSchema,
      discoveredAt: z.string().datetime().optional(),
      about: z.string(),
      skills: z.array(evalAgentSkillSchema),
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
  input: z.infer<typeof swotEvalInputSchema>,
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
  const progressReporter = ProgressReporter.from(async () => {});
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

  context.entities.register("agent", evalAgentEntitySchema, agentAdapter);
  context.entities.register("skill", evalSkillEntitySchema, skillAdapter);
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
    id: "assessment",
    packageName: packageJson.name,
    version: packageJson.version,
    description: packageJson.description,
    type: "service",
    register: registerSwotEvalPlugin,
  };
}

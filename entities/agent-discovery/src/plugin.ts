import type {
  Plugin,
  Template,
  DataSource,
  JobHandler,
  EntityPluginContext,
} from "@brains/plugins";
import { EntityPlugin, parseMarkdownWithFrontmatter } from "@brains/plugins";
import {
  agentEntitySchema,
  agentFrontmatterSchema,
  type AgentEntity,
} from "./schemas/agent";
import { AgentAdapter } from "./adapters/agent-adapter";
import { AgentDataSource } from "./datasources/agent-datasource";
import { AgentGenerationJobHandler } from "./handlers/agent-generation-handler";
import { getTemplates } from "./lib/register-templates";
import packageJson from "../package.json";

const agentAdapter = new AgentAdapter();

function parseAgentFrontmatter(entity: AgentEntity) {
  return parseMarkdownWithFrontmatter(entity.content, agentFrontmatterSchema)
    .metadata;
}

export class AgentDiscoveryPlugin extends EntityPlugin<AgentEntity> {
  readonly entityType = "agent";
  readonly schema = agentEntitySchema;
  readonly adapter = agentAdapter;

  constructor() {
    super("agent-discovery", packageJson);
  }

  protected override createGenerationHandler(
    context: EntityPluginContext,
  ): JobHandler | null {
    return new AgentGenerationJobHandler(
      this.logger.child("AgentGenerationJobHandler"),
      context,
    );
  }

  protected override getTemplates(): Record<string, Template> {
    return getTemplates();
  }

  protected override getDataSources(): DataSource[] {
    return [new AgentDataSource(this.logger.child("AgentDataSource"))];
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    context.messaging.subscribe(
      "system:plugins:ready",
      async (): Promise<{ success: boolean }> => {
        await context.messaging.send("dashboard:register-widget", {
          id: "directory-summary",
          pluginId: this.id,
          title: "Agent Directory",
          section: "secondary",
          priority: 15,
          rendererName: "StatsWidget",
          dataProvider: async () => {
            const agents =
              await context.entityService.listEntities<AgentEntity>("agent");
            const frontmatters = agents.map(parseAgentFrontmatter);
            return {
              total: frontmatters.length,
              approved: frontmatters.filter((a) => a.status === "approved")
                .length,
              discovered: frontmatters.filter((a) => a.status === "discovered")
                .length,
              professional: frontmatters.filter(
                (a) => a.kind === "professional",
              ).length,
              team: frontmatters.filter((a) => a.kind === "team").length,
              collective: frontmatters.filter((a) => a.kind === "collective")
                .length,
            };
          },
        });

        await context.messaging.send("dashboard:register-widget", {
          id: "recent-discoveries",
          pluginId: this.id,
          title: "Recent Discoveries",
          section: "secondary",
          priority: 16,
          rendererName: "ListWidget",
          dataProvider: async () => {
            const agents =
              await context.entityService.listEntities<AgentEntity>("agent");
            const items = agents
              .map((entity) => ({
                entity,
                frontmatter: parseAgentFrontmatter(entity),
              }))
              .sort(
                (a, b) =>
                  new Date(b.frontmatter.discoveredAt).getTime() -
                  new Date(a.frontmatter.discoveredAt).getTime(),
              )
              .slice(0, 8)
              .map(({ entity, frontmatter }) => ({
                id: entity.id,
                name: frontmatter.brainName,
                description:
                  frontmatter.name === frontmatter.brainName
                    ? frontmatter.kind
                    : `${frontmatter.name} · ${frontmatter.kind}`,
                status: frontmatter.status,
              }));

            return { items };
          },
        });

        return { success: true };
      },
    );
  }

  protected override async getInstructions(): Promise<string | undefined> {
    return `## Agent directory
- Add a new agent contact with \`system_create\` using \`entityType: "agent"\`.
- List saved agents with \`system_list\` using \`entityType: "agent"\`.
- Approve a discovered agent with \`system_update\` on the \`agent\` entity using \`fields\` (for example \`fields: { status: "approved" }\`). Do not replace the full content just to change status.
- If the user gives an exact saved agent id like \`old-agent.io\`, call that single \`system_update\` directly instead of listing/searching first.
- Calling and saving agents are separate actions: if an agent is not saved yet, ask the user to add it first.
- If a user gives an agent URL, do not call it directly. Save the agent first, then use its local agent id.
- A URL-based or unsaved-domain agent contact request is a save-first directory case, not a wishlist case.
- If more than one saved agent could match the user’s name-based reference, ask which saved agent they mean before calling anything.
- Do not create a wish or any other entity for a missing or ambiguous agent unless the user explicitly asks you to add or save that agent.`;
  }
}

export function agentDiscoveryPlugin(): Plugin {
  return new AgentDiscoveryPlugin();
}

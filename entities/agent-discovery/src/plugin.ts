import type {
  Plugin,
  Template,
  DataSource,
  JobHandler,
  EntityPluginContext,
  CreateInput,
  CreateExecutionContext,
  CreateInterceptionResult,
} from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
import { agentEntitySchema, type AgentEntity } from "./schemas/agent";
import { AgentAdapter } from "./adapters/agent-adapter";
import { AgentDataSource } from "./datasources/agent-datasource";
import { AgentGenerationJobHandler } from "./handlers/agent-generation-handler";
import { extractDomain } from "./lib/fetch-agent-card";
import { buildAgentNetworkWidgetData } from "./lib/agent-network-widget";
import { getTemplates } from "./lib/register-templates";
import {
  AgentNetworkWidget,
  agentNetworkWidgetScript,
} from "./widgets/agent-network-widget";
import packageJson from "../package.json";

const agentAdapter = new AgentAdapter();

export class AgentDiscoveryPlugin extends EntityPlugin<AgentEntity> {
  readonly entityType = "agent";
  readonly schema = agentEntitySchema;
  readonly adapter = agentAdapter;

  constructor() {
    super("agent-discovery", packageJson);
  }

  protected override async interceptCreate(
    input: CreateInput,
    executionContext: CreateExecutionContext,
    context: EntityPluginContext,
  ): Promise<CreateInterceptionResult> {
    if (input.url && !input.prompt && !input.content) {
      const domain = extractDomain(input.url);

      if (domain) {
        const existing = await context.entityService.getEntity<AgentEntity>(
          "agent",
          domain,
        );

        if (existing) {
          if (existing.metadata.status !== "approved") {
            // Update metadata only. AgentAdapter.toMarkdown rebuilds
            // frontmatter from metadata on write, so content stays in sync.
            await context.entityService.updateEntity({
              ...existing,
              metadata: {
                ...existing.metadata,
                status: "approved",
              },
            });
          }

          return {
            kind: "handled",
            result: {
              success: true,
              data: { status: "created", entityId: existing.id },
            },
          };
        }
      }

      const jobId = await context.jobs.enqueue(
        "agent:generation",
        {
          prompt: input.url,
          url: input.url,
          status: "approved",
        },
        executionContext,
      );

      return {
        kind: "handled",
        result: {
          success: true,
          data: { status: "generating", jobId },
        },
      };
    }

    return { kind: "continue", input };
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
          id: "agent-network",
          pluginId: this.id,
          title: "Agent Network",
          section: "secondary",
          priority: 15,
          rendererName: "AgentNetworkWidget",
          component: AgentNetworkWidget,
          clientScript: agentNetworkWidgetScript,
          dataProvider: async () => buildAgentNetworkWidgetData(context),
        });

        return { success: true };
      },
    );
  }

  protected override async getInstructions(): Promise<string | undefined> {
    return `## Agent directory
- Add a new agent contact with \`system_create\` using \`entityType: "agent"\` and pass the domain or URL in \`url\`.
- List saved agents with \`system_list\` using \`entityType: "agent"\`.
- Approve a discovered agent with \`system_update\` on the \`agent\` entity using \`fields\` (for example \`fields: { status: "approved" }\`). Do not replace the full content just to change status.
- When the user explicitly says \`approve\`, \`approve it\`, \`yes approve\`, or \`approve <agent-id>\`, call \`system_update\` immediately with \`fields: { status: "approved" }\` and \`confirmed: true\`. Do not ask for another confirmation for that explicit approval request.
- If the previous turn identified one specific discovered agent, treat a short follow-up like \`approve\`, \`approve it\`, or \`yes approve\` as referring to that same agent id.
- If \`system_update\` says to use \`fields\`, or says full content replacement is invalid/empty, retry once immediately with \`fields\` instead of surfacing that error to the user.
- If the user gives an exact saved agent id like \`old-agent.io\`, call that single \`system_update\` directly instead of listing/searching first.
- Calling and saving agents are separate actions: if an agent is not saved yet, tell the user it is not saved in the local agent directory yet and ask them to add/save it first.
- If a user gives an agent URL, do not call it directly. Save the agent first, then use its local agent id.
- A URL-based or unsaved-domain agent contact request is a save-first directory case, not a wishlist case.
- If more than one saved agent could match the user’s name-based reference, ask which saved agent they mean before calling anything.
- Do not create a wish or any other entity for a missing or ambiguous agent unless the user explicitly asks you to add or save that agent.`;
  }
}

export function agentDiscoveryPlugin(): Plugin {
  return new AgentDiscoveryPlugin();
}

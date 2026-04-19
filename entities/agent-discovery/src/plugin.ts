import type {
  Plugin,
  Template,
  DataSource,
  JobHandler,
  EntityPluginContext,
} from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
import { agentEntitySchema, type AgentEntity } from "./schemas/agent";
import { AgentAdapter } from "./adapters/agent-adapter";
import { AgentDataSource } from "./datasources/agent-datasource";
import { AgentGenerationJobHandler } from "./handlers/agent-generation-handler";
import { getTemplates } from "./lib/register-templates";
import packageJson from "../package.json";

const agentAdapter = new AgentAdapter();

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

  protected override async getInstructions(): Promise<string | undefined> {
    return `## Agent directory
- Add a new agent contact with \`system_create\` using \`entityType: "agent"\`.
- List saved agents with \`system_list\` using \`entityType: "agent"\`.
- Archive or unarchive an agent with \`system_update\` on the \`agent\` entity.
- Calling and saving agents are separate actions: if an agent is not saved yet, ask the user to add it first.
- If a user gives an agent URL, do not call it directly. Save the agent first, then use its local agent id.
- Do not create a wish or any other entity for a missing agent unless the user explicitly asks you to add or save that agent.`;
  }
}

export function agentDiscoveryPlugin(): Plugin {
  return new AgentDiscoveryPlugin();
}

import type {
  CreateExecutionContext,
  CreateInput,
  CreateInterceptionResult,
  DataSource,
  EntityPluginContext,
  JobHandler,
  Plugin,
  Template,
} from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
import { AgentAdapter } from "../adapters/agent-adapter";
import { AgentDataSource } from "../datasources/agent-datasource";
import { AgentGenerationJobHandler } from "../handlers/agent-generation-handler";
import { interceptAgentUrlCreate } from "../lib/agent-create-interceptor";
import { registerAgentNetworkDashboardWidget } from "../lib/agent-dashboard";
import { AGENT_DISCOVERY_PLUGIN_ID, AGENT_ENTITY_TYPE } from "../lib/constants";
import { getAgentDiscoveryInstructions } from "../lib/agent-instructions";
import { getTemplates } from "../lib/register-templates";
import { agentEntitySchema, type AgentEntity } from "../schemas/agent";
import packageJson from "../../package.json";

const agentAdapter = new AgentAdapter();

export class AgentDiscoveryPlugin extends EntityPlugin<AgentEntity> {
  readonly entityType = AGENT_ENTITY_TYPE;
  readonly schema = agentEntitySchema;
  readonly adapter = agentAdapter;

  constructor() {
    super(AGENT_DISCOVERY_PLUGIN_ID, packageJson);
  }

  protected override interceptCreate(
    input: CreateInput,
    executionContext: CreateExecutionContext,
    context: EntityPluginContext,
  ): Promise<CreateInterceptionResult> {
    return interceptAgentUrlCreate(input, executionContext, context, this.id);
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
    registerAgentNetworkDashboardWidget(context, this.id);
  }

  protected override async getInstructions(): Promise<string | undefined> {
    return getAgentDiscoveryInstructions();
  }
}

export function agentDiscoveryPlugin(): Plugin {
  return new AgentDiscoveryPlugin();
}

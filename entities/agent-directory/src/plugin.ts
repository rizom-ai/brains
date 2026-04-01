import type { Plugin } from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
import { agentEntitySchema, type AgentEntity } from "./schemas/agent";
import { AgentAdapter } from "./adapters/agent-adapter";
import packageJson from "../package.json";

const agentAdapter = new AgentAdapter();

export class AgentDirectoryPlugin extends EntityPlugin<AgentEntity> {
  readonly entityType = "agent";
  readonly schema = agentEntitySchema;
  readonly adapter = agentAdapter;

  constructor() {
    super("agent-directory-entity", packageJson);
  }
}

export function agentDirectoryPlugin(): Plugin {
  return new AgentDirectoryPlugin();
}

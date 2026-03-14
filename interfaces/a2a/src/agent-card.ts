import type { AgentCard, AgentSkill } from "@a2a-js/sdk";
import type { PluginTool } from "@brains/plugins";
import type { BrainCharacter } from "@brains/plugins";

/**
 * Options for building an Agent Card
 */
export interface AgentCardOptions {
  /** Brain character identity */
  character: BrainCharacter;
  /** Brain version */
  version: string;
  /** Domain the brain is served at */
  domain?: string;
  /** Organization name for the provider field */
  organization?: string;
  /** Registered tools (filtered by public permission) */
  tools: PluginTool[];
}

/**
 * Build an A2A Agent Card from brain identity and registered tools.
 *
 * The card is generated dynamically at runtime after all plugins
 * have registered, so it always reflects the current capabilities.
 */
export function buildAgentCard(options: AgentCardOptions): AgentCard {
  const { character, version, domain, organization, tools } = options;

  const url = domain ? `https://${domain}` : "http://localhost:3334";

  const skills: AgentSkill[] = tools.map((tool) => ({
    id: tool.name,
    name: tool.name,
    description: tool.description,
    tags: [],
    examples: [],
  }));

  return {
    name: character.name,
    description: character.purpose,
    url,
    version,
    protocolVersion: "0.2.2",
    capabilities: {
      streaming: true,
      pushNotifications: false,
    },
    skills,
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    ...(organization && {
      provider: {
        organization,
        url,
      },
    }),
  };
}

import type { AgentCard, AgentSkill } from "@a2a-js/sdk";
import type { BrainCharacter, AnchorProfile, ToolInfo } from "@brains/plugins";

/**
 * Options for building an Agent Card
 */
export interface AgentCardOptions {
  /** Brain character identity */
  character: BrainCharacter;
  /** Anchor (owner) profile */
  profile: AnchorProfile;
  /** Brain version */
  version: string;
  /** Domain the brain is served at */
  domain?: string;
  /** Organization name for the provider field */
  organization?: string;
  /** Registered tools (filtered by public permission) */
  tools: ToolInfo[];
  /** Whether bearer token auth is configured */
  authEnabled?: boolean;
}

/**
 * Build an A2A Agent Card from brain identity and registered tools.
 *
 * The card is generated dynamically at runtime after all plugins
 * have registered, so it always reflects the current capabilities.
 */
/**
 * Build a human-readable description for the Agent Card.
 * Includes who the agent belongs to and what it does.
 */
function buildDescription(
  character: BrainCharacter,
  profile: AnchorProfile,
): string {
  return `${character.name} is ${profile.name}'s ${character.role}. Its purpose is: ${character.purpose}.`;
}

export function buildAgentCard(options: AgentCardOptions): AgentCard {
  const { character, profile, version, domain, organization, tools } = options;

  const baseUrl = domain ? `https://${domain}` : "http://localhost:3334";
  const url = `${baseUrl}/a2a`;

  const skills: AgentSkill[] = tools.map((tool) => ({
    id: tool.name,
    name: tool.name,
    description: tool.description,
    tags: [],
    examples: [],
  }));

  return {
    name: character.name,
    description: buildDescription(character, profile),
    url,
    version,
    protocolVersion: "0.2.2",
    capabilities: {
      streaming: false,
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
    ...(options.authEnabled && {
      securitySchemes: {
        bearerAuth: {
          type: "http" as const,
          scheme: "bearer",
        },
      },
      security: [{ bearerAuth: [] }],
    }),
  };
}

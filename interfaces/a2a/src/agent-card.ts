import type { AgentCard, AgentSkill, AgentExtension } from "@a2a-js/sdk";
import type {
  BrainCharacter,
  AnchorProfile,
  ToolInfo,
  SkillData,
} from "@brains/plugins";
import { ANCHOR_EXTENSION_URI } from "@brains/plugins";

export interface AgentCardOptions {
  /** Brain character identity */
  character: BrainCharacter;
  /** Anchor (owner) profile */
  profile: AnchorProfile;
  /** Brain version */
  version: string;
  /** Domain the brain is served at */
  domain?: string;
  /** Explicit public base URL override, used when mounted on a shared host */
  baseUrl?: string;
  /** Organization name for the provider field */
  organization?: string;
  /** Anchor kind: professional (individual), team, or collective */
  kind?: "professional" | "team" | "collective";
  /** Registered tools (filtered by public permission) */
  tools: ToolInfo[];
  /** Derived skill data — replaces tool-based skills when present */
  skills?: SkillData[];
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

  const baseUrl =
    options.baseUrl ?? (domain ? `https://${domain}` : "http://localhost:8080");
  const url = `${baseUrl}/a2a`;

  // Use derived skills when available, fall back to tool mapping
  const cardSkills: AgentSkill[] =
    options.skills && options.skills.length > 0
      ? options.skills.map((skill) => ({
          id: skill.name.toLowerCase().replace(/\s+/g, "-"),
          name: skill.name,
          description: skill.description,
          tags: skill.tags,
          examples: skill.examples,
        }))
      : tools.map((tool) => ({
          id: tool.name,
          name: tool.name,
          description: tool.description,
          tags: [],
          examples: [],
        }));

  // Build anchor-profile extension
  const anchorParams: Record<string, unknown> = {
    name: profile.name,
  };
  if (options.kind) anchorParams["kind"] = options.kind;
  if (profile.description) anchorParams["description"] = profile.description;
  if (organization) anchorParams["organization"] = organization;

  const extensions: AgentExtension[] = [
    {
      uri: ANCHOR_EXTENSION_URI,
      description: "Anchor (operator) identity for this brain",
      params: anchorParams,
    },
  ];

  return {
    name: character.name,
    description: buildDescription(character, profile),
    url,
    version,
    protocolVersion: "0.2.2",
    capabilities: {
      streaming: true,
      pushNotifications: false,
      extensions,
    },
    skills: cardSkills,
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

import type { AgentCard } from "@a2a-js/sdk";
import type { InterfaceSetupContext, z } from "@brains/sdk/interfaces";
import { buildAgentCard } from "./agent-card";
import packageJson from "../package.json";

/** The reads an Agent Card is built from, as the setup context hands them over. */
export type AgentCardSource = Pick<
  InterfaceSetupContext<z.ZodType<object, object>>,
  "identity" | "profileKinds" | "tools" | "publicSkills" | "domain"
>;

/**
 * Describe this brain to a peer.
 *
 * Asked after every plugin has registered and the profile has loaded, which
 * is why the interface builds it on first request rather than at setup; a
 * publisher that mirrors the card elsewhere calls this with the same reads.
 */
export async function describeBrain(
  source: AgentCardSource,
  options: { readonly organization?: string | undefined } = {},
): Promise<AgentCard> {
  return buildAgentCard({
    character: source.identity.get(),
    profile: source.identity.getProfile(),
    version: packageJson.version,
    ...(source.domain ? { domain: source.domain } : {}),
    ...(options.organization ? { organization: options.organization } : {}),
    profileKind: source.profileKinds.getResolved(),
    tools: source.tools.listForPermissionLevel("public"),
    skills: await source.publicSkills.list(),
    authEnabled: false,
  });
}

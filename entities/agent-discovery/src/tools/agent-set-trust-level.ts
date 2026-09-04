import { authenticatedUserId } from "@brains/contracts";
import { keyFingerprint } from "@brains/http-signatures";
import { z, type EntityReactionContext } from "@brains/sdk/entities";
import { defineTool, type ServiceToolDefinition } from "@brains/sdk/services";
import { AGENT_ENTITY_TYPE } from "../lib/constants";
import { extractDomain, type FetchFn } from "../lib/fetch-agent-card";

import { agentEntitySchema } from "../schemas/agent";

const trustLevelSchema: z.ZodEnum<{ public: "public"; trusted: "trusted" }> =
  z.enum(["public", "trusted"]);

const agentSetTrustLevelInputSchema: z.ZodObject<{
  agent: z.ZodString;
  level: typeof trustLevelSchema;
}> = z.object({
  agent: z
    .string()
    .min(1)
    .describe("Saved agent id, domain, or URL whose inbound A2A trust to set."),
  level: trustLevelSchema.describe(
    "Inbound A2A trust level. Use trusted to grant trusted inbound access, public to revoke it.",
  ),
});

type AgentSetTrustLevelContext = EntityReactionContext;

const jwksSchema = z.object({
  keys: z.array(z.unknown()),
});

const a2aPublicKeySchema = z
  .object({
    kty: z.literal("OKP"),
    crv: z.literal("Ed25519"),
    x: z.string(),
    kid: z.string().optional(),
    alg: z.literal("EdDSA").optional(),
  })
  .passthrough();

function normalizeAgentLookup(input: string): string {
  return (extractDomain(input) || input.trim()).toLowerCase();
}

async function resolveAgentDomain(
  context: AgentSetTrustLevelContext,
  agent: string,
): Promise<{ domain: string } | null> {
  const id = normalizeAgentLookup(agent);
  const entity = await context.entities.getEntity(
    {
      entityType: AGENT_ENTITY_TYPE,
      id,
    },
    agentEntitySchema,
  );
  if (!entity) return null;

  const domain = normalizeAgentLookup(
    entity.metadata.a2aEndpoint ?? entity.metadata.url,
  );
  if (!domain) return null;
  return { domain };
}

async function fetchA2AKeyFingerprint(
  domain: string,
  fetchFn: FetchFn,
): Promise<string | null> {
  try {
    const response = await fetchFn(`https://${domain}/.well-known/jwks.json`);
    if (!response.ok) return null;

    const parsedJwks = jwksSchema.safeParse(await response.json());
    if (!parsedJwks.success) return null;

    const parsedKey = parsedJwks.data.keys
      .map((key) => a2aPublicKeySchema.safeParse(key))
      .find((result) => result.success);
    if (!parsedKey?.success) return null;

    return keyFingerprint(parsedKey.data);
  } catch {
    return null;
  }
}

const agentSetTrustLevelOutputSchema: z.ZodObject<{
  agent: z.ZodString;
  level: z.ZodString;
  keyFingerprint: z.ZodOptional<z.ZodString>;
}> = z.object({
  agent: z.string(),
  level: z.string(),
  keyFingerprint: z.string().optional(),
});

/**
 * Grant or revoke inbound A2A trust for a saved contact.
 *
 * Granting pins the key the peer serves at the moment of the grant. It used
 * to be fetched before the question was asked and handed back through the
 * caller, which meant the pinned key was whatever came back rather than
 * whatever the domain publishes.
 */
export function agentSetTrustLevelTool(
  fetchFn: FetchFn = globalThis.fetch,
): ServiceToolDefinition<
  "set-trust-level",
  typeof agentSetTrustLevelInputSchema,
  typeof agentSetTrustLevelOutputSchema
> {
  return defineTool({
    name: "set-trust-level",
    description:
      "Grant or revoke inbound A2A trust for a saved contact; this is the only tool for inbound trust changes. To revoke, call directly with level public—no key fingerprint or preliminary lookup is needed. To grant, use level trusted; the tool resolves and pins the peer key. This does not add or remove directory contacts or change outbound calling.",
    input: agentSetTrustLevelInputSchema,
    output: agentSetTrustLevelOutputSchema,
    permission: "admin",
    sideEffects: "external",
    // Names the agent and the direction: approving a trust change without
    // seeing whose is not a decision anyone can make.
    confirmation: ({ agent, level }) =>
      level === "trusted"
        ? `Grant inbound trusted A2A access to ${agent}? This pins the signing key it publishes right now.`
        : `Revoke inbound trusted A2A access from ${agent}?`,
    execute: async ({ input, caller, ...context }) => {
      const authService = context.auth.getFederation();
      if (!authService) {
        throw new Error("Auth service is required to set inbound A2A trust.");
      }

      const resolved = await resolveAgentDomain(context, input.agent);
      if (!resolved) {
        throw new Error(
          `No saved agent contact found for ${input.agent}. Connect the agent before setting inbound trust.`,
        );
      }

      const actorUserId = caller ? authenticatedUserId(caller) : undefined;
      const attribution = actorUserId ? { actorUserId } : {};

      if (input.level === "public") {
        await authService.revokeA2APeerTrust(resolved.domain, attribution);
        return { agent: resolved.domain, level: "public" };
      }

      const fingerprint = await fetchA2AKeyFingerprint(
        resolved.domain,
        fetchFn,
      );
      if (!fingerprint) {
        throw new Error(
          `Could not fetch an A2A signing key from ${resolved.domain}.`,
        );
      }

      const grant = await authService.grantA2APeerTrust(
        {
          domain: resolved.domain,
          keyFingerprint: fingerprint,
          grantedLevel: "trusted",
        },
        attribution,
      );
      return {
        agent: resolved.domain,
        level: grant.grantedLevel,
        keyFingerprint: grant.keyFingerprint,
      };
    },
  });
}

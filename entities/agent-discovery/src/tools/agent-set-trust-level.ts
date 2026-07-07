import { getActiveAuthService } from "@brains/auth-service";
import { keyFingerprint } from "@brains/http-signatures";
import type {
  EntityPluginContext,
  ServicePluginContext,
} from "@brains/plugins";
import {
  ConfirmationArgsStore,
  type Tool,
  type ToolResponse,
} from "@brains/mcp-service";
import { z } from "@brains/utils/zod";
import { AGENT_ENTITY_TYPE } from "../lib/constants";
import { extractDomain, type FetchFn } from "../lib/fetch-agent-card";
import type { AgentEntity } from "../schemas/agent";

const trustLevelSchema = z.enum(["public", "trusted"]);

const agentSetTrustLevelInputSchema = z.object({
  agent: z
    .string()
    .min(1)
    .describe("Saved agent id, domain, or URL whose inbound A2A trust to set."),
  level: trustLevelSchema.describe(
    "Inbound A2A trust level. Use trusted to grant trusted inbound access, public to revoke it.",
  ),
  confirmed: z.boolean().optional(),
  confirmationToken: z.string().optional(),
  keyFingerprint: z.string().optional(),
});

type AgentSetTrustLevelInput = z.infer<typeof agentSetTrustLevelInputSchema>;

type AgentSetTrustLevelContext = Pick<
  EntityPluginContext | ServicePluginContext,
  "entityService"
>;

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
  const entity = await context.entityService.getEntity<AgentEntity>({
    entityType: AGENT_ENTITY_TYPE,
    id,
  });
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

export function createAgentSetTrustLevelTool(
  context: AgentSetTrustLevelContext,
  fetchFn: FetchFn = globalThis.fetch,
): Tool {
  const toolName = "agent_set_trust_level";
  const confirmationArgsStore = new ConfirmationArgsStore();

  return {
    name: toolName,
    description:
      "Set inbound A2A trust for a saved agent contact. Use level trusted to grant inbound trusted access after fetching and pinning the peer JWKS key fingerprint; use level public to revoke inbound trusted access. This affects inbound A2A trust only and does not add or remove the directory contact or affect outbound calling. Requires confirmation.",
    inputSchema: agentSetTrustLevelInputSchema.shape,
    visibility: "anchor",
    sideEffects: "external",
    handler: async (rawInput): Promise<ToolResponse> => {
      const parsed = agentSetTrustLevelInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return {
          success: false,
          error: `Invalid input: ${parsed.error.errors.map((error) => `${error.path.join(".")}: ${error.message}`).join(", ")}`,
        };
      }

      const authService = getActiveAuthService();
      if (!authService) {
        return {
          success: false,
          error: "Auth service is required to set inbound A2A trust.",
          code: "auth_service_unavailable",
        };
      }

      const resolved = await resolveAgentDomain(context, parsed.data.agent);
      if (!resolved) {
        return {
          success: false,
          error: `No saved agent contact found for ${parsed.data.agent}. Connect the agent before setting inbound trust.`,
          code: "agent_not_found",
        };
      }

      const input = parsed.data;
      if (input.confirmed) {
        const validation = confirmationArgsStore.validate(
          input.confirmationToken,
          input,
        );
        if (validation.status === "missing") {
          return {
            success: false,
            error:
              "No pending agent trust confirmation found. Please request the trust change again and confirm the new approval.",
          };
        }
        if (validation.status === "mismatch") {
          return {
            success: false,
            error:
              "Confirmed agent trust arguments do not match the pending approval. Please request the trust change again and confirm the new approval.",
          };
        }

        if (input.level === "trusted") {
          if (!input.keyFingerprint) {
            return {
              success: false,
              error: "Missing key fingerprint for trusted A2A grant.",
            };
          }
          const grant = await authService.grantA2APeerTrust({
            domain: resolved.domain,
            keyFingerprint: input.keyFingerprint,
            grantedLevel: "trusted",
          });
          return {
            success: true,
            data: {
              agent: resolved.domain,
              level: grant.grantedLevel,
              keyFingerprint: grant.keyFingerprint,
            },
          };
        }

        await authService.revokeA2APeerTrust(resolved.domain);
        return {
          success: true,
          data: {
            agent: resolved.domain,
            level: "public",
          },
        };
      }

      const keyFingerprintForTrust =
        input.level === "trusted"
          ? await fetchA2AKeyFingerprint(resolved.domain, fetchFn)
          : undefined;
      if (input.level === "trusted" && !keyFingerprintForTrust) {
        return {
          success: false,
          error: `Could not fetch an A2A signing key from ${resolved.domain}.`,
          code: "jwks_unavailable",
        };
      }

      const confirmationArgs =
        confirmationArgsStore.create<AgentSetTrustLevelInput>(
          (confirmationToken) => ({
            agent: resolved.domain,
            level: input.level,
            confirmed: true,
            confirmationToken,
            ...(keyFingerprintForTrust
              ? { keyFingerprint: keyFingerprintForTrust }
              : {}),
          }),
        );

      const isTrusted = input.level === "trusted";
      return {
        needsConfirmation: true,
        toolName,
        summary: isTrusted
          ? `Grant inbound trusted A2A access to ${resolved.domain}?`
          : `Revoke inbound trusted A2A access from ${resolved.domain}?`,
        preview: isTrusted
          ? `This will grant inbound trusted A2A access to ${resolved.domain} and pin key fingerprint ${keyFingerprintForTrust}. It will not add or remove the directory contact.`
          : `This will revoke inbound trusted A2A access from ${resolved.domain}. The directory contact remains saved for outbound calls.`,
        args: confirmationArgs,
      };
    },
  };
}

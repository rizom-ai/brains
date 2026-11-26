import {
  a2aPeerTrustChangedChannel,
  authenticatedUserId,
} from "@brains/contracts";
import { keyFingerprint } from "@brains/http-signatures";
import { z } from "@brains/utils/zod";
import { AGENT_ENTITY_TYPE } from "../lib/constants";
import type { FetchLike } from "@brains/utils/fetch-like";
import { extractDomain } from "../lib/extract-domain";
import { agentEntitySchema, type AgentEntity } from "../schemas/agent";
import {
  ConfirmationArgsStore,
  internalFullScope,
  type AuthBackend,
  type Tool,
  type ToolResponse,
} from "@brains/sdk/internal/service-runtime";
import type { AgentContext } from "../lib/agent-context";
import { parseAgentEntity, rewriteAgentContent } from "../lib/agent-content";
import type { ContactApprovals } from "../lib/contact-approvals";

const trustLevelSchema = z.enum(["public", "trusted"]);

const contactSchema = z.enum(["approved", "archived"]);

const agentSetStandingInputSchema = z.object({
  agent: z
    .string()
    .min(1)
    .describe("Saved agent id, domain, or URL whose standing to set."),
  contact: contactSchema
    .optional()
    .describe(
      "Whether this brain may contact the agent. Use approved to approve or restore it, archived to archive it and stop contacting it. Set this or level, not both.",
    ),
  level: trustLevelSchema
    .optional()
    .describe(
      "Inbound A2A trust level. Use trusted to grant trusted inbound access, public to revoke it. Set this or contact, not both.",
    ),
  confirmed: z.boolean().optional(),
  confirmationToken: z.string().optional(),
  keyFingerprint: z.string().optional(),
});

type AgentSetStandingInput = z.infer<typeof agentSetStandingInputSchema>;

type AgentSetStandingContext = Pick<
  AgentContext,
  "entityService" | "auth" | "messaging"
>;

const ONE_CHANGE =
  "Set either contact (approved or archived) or level (trusted or public), one per call.";

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
  context: AgentSetStandingContext,
  agent: string,
): Promise<{ domain: string; entity: AgentEntity } | null> {
  const id = normalizeAgentLookup(agent);
  const entity = await context.entityService.getEntity(
    {
      entityType: AGENT_ENTITY_TYPE,
      id,
      visibilityScope: internalFullScope(
        "agent_set_standing is admin-only and sets trust for agents saved at any visibility",
      ),
    },
    agentEntitySchema,
  );
  if (!entity) return null;

  const domain = normalizeAgentLookup(entity.metadata.url);
  if (!domain) return null;
  return { domain, entity };
}

async function fetchA2AKeyFingerprint(
  domain: string,
  fetchFn: FetchLike,
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
    // No reachable or usable key means no fingerprint to pin, which the
    // caller handles as an unverified agent rather than an error.
    return null;
  }
}

/** The auth service, which a trust change was admitted with. */
function trustBackend(backend: AuthBackend | undefined): AuthBackend {
  if (!backend)
    throw new Error("Auth service is required to set inbound A2A trust.");
  return backend;
}

/** An agent's entry rewritten to show whether the brain may contact it. */
async function showContact(
  context: AgentSetStandingContext,
  entity: AgentEntity,
  status: "approved" | "archived",
): Promise<void> {
  if (entity.metadata.status === status) return;
  await context.entityService.updateEntity({
    entity: {
      ...entity,
      content: rewriteAgentContent(parseAgentEntity(entity), {
        status,
        ...(status === "approved"
          ? { introducedBy: undefined, hops: undefined }
          : {}),
      }),
      metadata: { ...entity.metadata, status },
    },
  });
}

/** The copies this brain took from a peer, which archiving it erases. */
export interface CopiesOfPeer {
  count(domain: string): Promise<number>;
  /** Erase each down to a stub: its text removed, a record of it kept. */
  erase(domain: string): Promise<number>;
}

export function createAgentSetStandingTool(
  context: AgentSetStandingContext,
  approvals: ContactApprovals,
  fetchFn: FetchLike = globalThis.fetch,
  copies?: CopiesOfPeer,
): Tool {
  const toolName = "agent_set_standing";
  const confirmationArgsStore = new ConfirmationArgsStore();

  return {
    name: toolName,
    description:
      "Set a saved contact's standing with this brain, one change per call. contact approves, restores or archives it: approved lets this brain contact the agent, archived stops that; this is the only way to approve or archive a contact. level grants or revokes inbound A2A trust: trusted resolves and pins the peer key, public revokes with no key fingerprint or lookup; this is the only tool for inbound trust changes. Neither changes the other, and setting a level does not add or remove directory contacts. Requires confirmation.",
    inputSchema: agentSetStandingInputSchema.shape,
    visibility: "admin",
    sideEffects: "external",
    handler: async (rawInput, toolContext): Promise<ToolResponse> => {
      const parsed = agentSetStandingInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return {
          success: false,
          error: `Invalid input: ${parsed.error.issues.map((error) => `${error.path.join(".")}: ${error.message}`).join(", ")}`,
        };
      }

      if (
        (parsed.data.contact === undefined) ===
        (parsed.data.level === undefined)
      ) {
        return { success: false, error: ONE_CHANGE };
      }

      // Inbound trust is the auth service's; who the brain contacts is not,
      // so a brain without one can still approve and archive.
      const authService = context.auth.get();
      const actorUserId = authenticatedUserId(toolContext);
      if (!authService && parsed.data.level !== undefined) {
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
          error: `No saved agent contact found for ${parsed.data.agent}. Connect the agent before setting its standing.`,
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

        if (input.contact) {
          const domain = resolved.entity.id;
          if (input.contact === "approved") {
            await approvals.approve(domain, actorUserId);
          } else {
            await approvals.revoke(domain, actorUserId);
            // What it shared was shared with a peer this brain kept.
            await copies?.erase(domain);
          }
          await showContact(context, resolved.entity, input.contact);
          return {
            success: true,
            data: { agent: domain, contact: input.contact },
          };
        }

        if (input.level === "trusted") {
          if (!input.keyFingerprint) {
            return {
              success: false,
              error: "Missing key fingerprint for trusted A2A grant.",
            };
          }
          const grant = await trustBackend(authService).grantA2APeerTrust(
            {
              domain: resolved.domain,
              keyFingerprint: input.keyFingerprint,
              grantedLevel: "trusted",
            },
            actorUserId ? { actorUserId } : {},
          );
          await context.messaging.broadcast(a2aPeerTrustChangedChannel, {
            domain: resolved.domain,
            level: "trusted",
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

        await trustBackend(authService).revokeA2APeerTrust(
          resolved.domain,
          actorUserId ? { actorUserId } : {},
        );
        await context.messaging.broadcast(a2aPeerTrustChangedChannel, {
          domain: resolved.domain,
          level: "public",
        });
        return {
          success: true,
          data: {
            agent: resolved.domain,
            level: "public",
          },
        };
      }

      if (input.contact) {
        const domain = resolved.entity.id;
        const approving = input.contact === "approved";
        const held = approving ? 0 : ((await copies?.count(domain)) ?? 0);
        const erased =
          held === 0
            ? ""
            : ` The ${held} ${held === 1 ? "copy" : "copies"} this brain took from it ${held === 1 ? "is" : "are"} erased: ${held === 1 ? "its text is" : "their text is"} removed and a record that ${held === 1 ? "it" : "they"} existed is kept.`;
        return {
          needsConfirmation: true,
          toolName,
          summary: approving
            ? `Approve contacting ${domain}?`
            : `Archive ${domain} and stop contacting it?`,
          preview: approving
            ? `This brain will be allowed to contact ${domain}. Its inbound trust is not changed.`
            : `This brain will stop contacting ${domain}, and its entry will be archived.${erased} Its inbound trust is not changed.`,
          args: confirmationArgsStore.create<AgentSetStandingInput>(
            (confirmationToken) => ({
              agent: domain,
              contact: input.contact,
              confirmed: true,
              confirmationToken,
            }),
          ),
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
        confirmationArgsStore.create<AgentSetStandingInput>(
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

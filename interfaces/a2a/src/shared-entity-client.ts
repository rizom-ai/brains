import {
  ENTITY_SHARING_EXTENSION_URI,
  sharedEntitySchema,
  type SharedEntityAskResponse,
} from "@brains/contracts";
import {
  fetchVerifiedAgentCard,
  permissionToVisibilityScope,
} from "@brains/sdk/internal/interface-runtime";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import type { A2AClientDeps } from "./client";

const DEFAULT_TIMEOUT_MS = 30_000;

const answerSchema = z.looseObject({
  result: z.looseObject({
    parts: z.array(z.looseObject({ kind: z.string(), data: z.unknown() })),
  }),
});

function refused(code: string, error: string): SharedEntityAskResponse {
  return { status: "refused", code, error };
}

/**
 * Ask a saved, approved peer for one of its shared entities, over the
 * entity-sharing extension. A peer that is not saved, is archived or is not
 * approved is refused before any network contact, and so is a brain that
 * cannot sign: a peer serves only callers it can verify. The peer's 404 is
 * "not found", whatever its reason.
 */
export async function fetchSharedEntity(
  wanted: { agent: string; entityType: string; id: string },
  deps: A2AClientDeps,
): Promise<SharedEntityAskResponse> {
  const agentId = wanted.agent.trim().toLowerCase();
  const saved = await deps.entityService?.getEntity({
    entityType: "agent",
    id: agentId,
    // An admin's tool asks: a peer saved at any visibility is theirs to name.
    visibilityScope: permissionToVisibilityScope("admin"),
  });
  if (!saved) {
    return refused("agent_not_saved", `Agent ${agentId} is not saved.`);
  }
  if (saved.metadata["status"] === "archived") {
    return refused("agent_archived", `Agent ${agentId} is archived.`);
  }
  if (!(await deps.isContactApproved?.(agentId))) {
    return refused(
      "agent_not_approved",
      `Agent ${agentId} is not approved yet. Approve it first.`,
    );
  }
  const { requestSigner } = deps;
  if (!requestSigner) {
    return refused(
      "unsigned",
      "This brain cannot sign A2A requests, and a peer shares only with callers it can verify.",
    );
  }

  const fetchFn = deps.fetch ?? fetch;
  const timeoutMs = deps.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const verified = await fetchVerifiedAgentCard(agentId, {
    fetch: fetchFn,
    timeoutMs,
  });
  if (!verified.ok) {
    return refused("agent_card_unavailable", verified.error);
  }
  if (!verified.card.extensions.includes(ENTITY_SHARING_EXTENSION_URI)) {
    return refused("not_offered", `${agentId} does not offer shared entities.`);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-A2A-Extensions": ENTITY_SHARING_EXTENSION_URI,
  };
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: crypto.randomUUID(),
    method: "message/send",
    params: {
      message: {
        kind: "message",
        messageId: crypto.randomUUID(),
        role: "user",
        parts: [
          {
            kind: "data",
            data: { op: "get", entityType: wanted.entityType, id: wanted.id },
          },
        ],
      },
    },
  });
  await requestSigner({
    method: "POST",
    url: verified.card.url,
    headers,
    body,
  });

  let response: Response;
  try {
    response = await fetchFn(verified.card.url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return refused(
      "peer_failed",
      getErrorMessage(error, `${agentId} did not answer`),
    );
  }
  if (response.status === 404) return { status: "not-found" };
  if (!response.ok) {
    return refused(
      "peer_failed",
      `${agentId} answered HTTP ${response.status}`,
    );
  }

  const answer = answerSchema.safeParse(
    await response.json().catch(() => null),
  );
  const entity = answer.success
    ? answer.data.result.parts
        .filter((part) => part.kind === "data")
        .map((part) => sharedEntitySchema.safeParse(part.data))
        .find((parsed) => parsed.success)?.data
    : undefined;
  if (entity?.entityType !== wanted.entityType || entity.id !== wanted.id) {
    return refused(
      "unreadable_answer",
      `${agentId} did not answer with the entity asked for.`,
    );
  }
  return { status: "found", entity };
}

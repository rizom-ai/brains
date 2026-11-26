import {
  a2aSharedEntityContract,
  SHARED_COPY_ENTITY_TYPE,
  type SharedEntity,
} from "@brains/contracts";
import {
  internalFullScope,
  type ServiceEntityReads,
} from "@brains/sdk/internal/service-runtime";
import type { BaseEntity } from "@brains/sdk/internal/entity-runtime";
import { getErrorMessage } from "@brains/utils/error";
import { slugify } from "@brains/utils/string-utils";
import {
  sharedCopyMetadataSchema,
  type SharedCopyMetadata,
} from "../schemas/shared-copy";
import type { AgentContext } from "./agent-context";

/** What taking, refreshing and dropping copies reads and writes. */
export interface SharedCopyContext {
  readonly entityService: AgentContext["entityService"];
  readonly messaging: AgentContext["messaging"];
  /** A document read as this brain's adapter for its type reads it, written nowhere. */
  readonly deserializeEntity: ServiceEntityReads["deserializeEntity"];
}

const everyCopy = internalFullScope(
  "the brain keeps the copies it took, at whatever visibility",
);

export interface Refusal {
  success: false;
  code: string;
  error: string;
}

/** What a peer answered when asked for one entity. */
export type PeerAnswer =
  | { kind: "found"; entity: SharedEntity }
  /** The peer says it shares no such entity with this brain. */
  | { kind: "not-shared" }
  /** No answer to rely on: unreachable, unsigned, unverified, not approved. */
  | { kind: "no-answer"; code: string; error: string };

/**
 * Ask the peer for one entity, over A2A's entity-sharing extension. The
 * A2A interface verifies the peer's signature before it hands the entity
 * over, so what is found here is the peer's own.
 */
export async function askPeer(
  context: Pick<SharedCopyContext, "messaging">,
  wanted: { agent: string; entityType: string; id: string },
): Promise<PeerAnswer> {
  const asked = await context.messaging.request(
    a2aSharedEntityContract,
    wanted,
  );
  if (asked.status === "unavailable") {
    return {
      kind: "no-answer",
      code: "a2a_unavailable",
      error: "This brain has no A2A interface to ask a peer through.",
    };
  }
  if (asked.status === "failed") {
    return {
      kind: "no-answer",
      code: asked.error.code,
      error: asked.error.message,
    };
  }
  const answer = asked.data;
  if (answer.status === "found")
    return { kind: "found", entity: answer.entity };
  if (answer.status === "not-found") return { kind: "not-shared" };
  return { kind: "no-answer", code: answer.code, error: answer.error };
}

/** A copy's id: the peer, the entity's type and its id there, as one slug. */
export function sharedCopyId(
  agent: string,
  entityType: string,
  id: string,
): string {
  const part = (value: string): string =>
    slugify(value.replace(/[.:~_/]+/g, "-"));
  return [agent, entityType, id].map(part).join("--");
}

/** An owner's document as its header, as written, and its body. */
function documentParts(markdown: string): { header?: string; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(markdown);
  if (!match) return { body: markdown };
  const [, header = "", body = ""] = match;
  return { header, body: body.replace(/^\n+/, "") };
}

export type TakeOutcome =
  | { ok: true; copyId: string; title: string }
  | { ok: false; code: string; error: string };

/**
 * Check that this brain could hold a peer's entity: it has the type, and
 * the document fits its own schema for it. The schema decides, so no list
 * of types is kept anywhere.
 */
export function readAsOwnType(
  context: Pick<SharedCopyContext, "entityService" | "deserializeEntity">,
  entity: SharedEntity,
): { ok: true; title: string } | { ok: false; code: string; error: string } {
  if (
    entity.entityType === SHARED_COPY_ENTITY_TYPE ||
    !context.entityService.hasEntityType(entity.entityType)
  ) {
    return {
      ok: false,
      code: "unknown_type",
      error: `This brain has no ${entity.entityType} type, so it cannot hold one.`,
    };
  }
  try {
    const parsed = context.deserializeEntity(
      entity.markdown,
      entity.entityType,
    );
    const title = parsed.metadata?.["title"] ?? parsed.metadata?.["name"];
    return { ok: true, title: typeof title === "string" ? title : entity.id };
  } catch (error) {
    return {
      ok: false,
      code: "invalid_entity",
      error: `The ${entity.entityType} does not fit this brain's schema for that type: ${getErrorMessage(error)}`,
    };
  }
}

export async function findSharedCopy(
  context: Pick<SharedCopyContext, "entityService">,
  copyId: string,
): Promise<BaseEntity | null> {
  return context.entityService.getEntity({
    entityType: SHARED_COPY_ENTITY_TYPE,
    id: copyId,
    visibilityScope: everyCopy,
  });
}

interface HeldCopy {
  entity: BaseEntity;
  metadata: SharedCopyMetadata;
}

/** The copies this brain holds whose owner still shares them, of one peer or all. */
export async function activeCopies(
  context: Pick<SharedCopyContext, "entityService">,
  agent?: string,
): Promise<HeldCopy[]> {
  const held = await context.entityService.listEntities({
    entityType: SHARED_COPY_ENTITY_TYPE,
    options: { filter: { visibilityScope: everyCopy } },
  });
  return held.flatMap((entity) => {
    const metadata = sharedCopyMetadataSchema.safeParse(entity.metadata).data;
    return metadata?.sourceState === "active" &&
      (agent === undefined || metadata.sourceBrain === agent)
      ? [{ entity, metadata }]
      : [];
  });
}

/**
 * Store a peer's entity as this brain's copy of it, over the copy it
 * already has when there is one. Readable by this brain's trusted users,
 * never by the public.
 */
export async function storeSharedCopy(
  context: Pick<SharedCopyContext, "entityService" | "deserializeEntity">,
  agent: string,
  entity: SharedEntity,
  now: string = new Date().toISOString(),
): Promise<TakeOutcome> {
  const readable = readAsOwnType(context, entity);
  if (!readable.ok) return readable;

  const copyId = sharedCopyId(agent, entity.entityType, entity.id);
  const existing = await findSharedCopy(context, copyId);
  const { header, body } = documentParts(entity.markdown);
  const kept = existing
    ? sharedCopyMetadataSchema.safeParse(existing.metadata).data
    : undefined;
  const metadata: SharedCopyMetadata = {
    title: readable.title,
    sourceBrain: agent,
    sourceEntityType: entity.entityType,
    sourceEntityId: entity.id,
    sourceState: "active",
    sourceContentHash: entity.contentHash,
    receivedAt: kept?.receivedAt ?? now,
    sourceSignedAt: entity.attestation.signedAt,
    sourceKeyId: entity.attestation.keyId,
    sourceSignature: entity.attestation.signature,
    ...(header !== undefined && { sourceHeader: header }),
  };

  if (existing) {
    await context.entityService.updateEntity({
      entity: { ...existing, content: body, metadata },
    });
  } else {
    await context.entityService.createEntity({
      entity: {
        id: copyId,
        entityType: SHARED_COPY_ENTITY_TYPE,
        content: body,
        metadata,
        visibility: "shared",
        created: now,
        updated: now,
      },
    });
  }
  return { ok: true, copyId, title: readable.title };
}

/**
 * Erase a copy down to a stub: the owner's words go, and what stays says
 * that it existed, whose it was, and the hash the owner signed, so what
 * this brain had can still be proven.
 */
export async function eraseToStub(
  context: Pick<SharedCopyContext, "entityService">,
  copy: HeldCopy,
  now: string = new Date().toISOString(),
): Promise<void> {
  const { sourceHeader: _ownersFields, ...kept } = copy.metadata;
  const metadata: SharedCopyMetadata = {
    ...kept,
    sourceState: "withdrawn",
    withdrawnAt: now,
  };
  await context.entityService.updateEntity({
    entity: { ...copy.entity, content: "", metadata },
  });
}

/** Erase every copy this brain took from one peer. Returns how many. */
export async function eraseCopiesFrom(
  context: Pick<SharedCopyContext, "entityService">,
  agent: string,
): Promise<number> {
  const held = await activeCopies(context, agent);
  for (const copy of held) await eraseToStub(context, copy);
  return held.length;
}

/**
 * Bring every copy up to what its owner shares now. An owner's new text is
 * taken; an owner that says it shares the entity no longer has its copy
 * erased to a stub; an owner that gives no answer to rely on changes
 * nothing, since being unreachable is never a withdrawal.
 */
export async function refreshSharedCopies(
  context: SharedCopyContext,
  signal?: AbortSignal,
): Promise<void> {
  for (const copy of await activeCopies(context)) {
    if (signal?.aborted) return;
    const { sourceBrain, sourceEntityType, sourceEntityId } = copy.metadata;
    const answer = await askPeer(context, {
      agent: sourceBrain,
      entityType: sourceEntityType,
      id: sourceEntityId,
    });
    if (answer.kind === "not-shared") {
      await eraseToStub(context, copy);
    } else if (
      answer.kind === "found" &&
      answer.entity.contentHash !== copy.metadata.sourceContentHash
    ) {
      // A text that no longer fits this brain's schema is not taken; the
      // copy it has stays as it was.
      await storeSharedCopy(context, sourceBrain, answer.entity);
    }
  }
}

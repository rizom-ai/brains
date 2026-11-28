import { internalFullScope } from "@brains/sdk/internal/service-runtime";
import {
  decisionSchema,
  insightSchema,
  type DecisionEntity,
  type InsightEntity,
  type MemorySource,
} from "../../schemas/conversation-memory";
import { DECISION_ENTITY_TYPE, INSIGHT_ENTITY_TYPE } from "../constants";
import type { MemoryEntityService } from "../memory-context";
import type { ClaimKind } from "./claim-extractor";

/** The entity type a kind of claim is stored as. */
export function claimEntityType(
  kind: ClaimKind,
): typeof DECISION_ENTITY_TYPE | typeof INSIGHT_ENTITY_TYPE {
  return kind === "insight" ? INSIGHT_ENTITY_TYPE : DECISION_ENTITY_TYPE;
}

/** A claim's heading and the text under it, up to its first section. */
export function headingAndText(content: string): {
  title: string;
  text: string;
} {
  const lines = content.split("\n");
  const at = lines.findIndex((line) => /^#\s+\S/.test(line));
  if (at < 0) return { title: "", text: content.trim() };
  const rest = lines.slice(at + 1);
  const section = rest.findIndex((line) => /^##\s/.test(line));
  return {
    title: (lines[at] ?? "").replace(/^#\s+/, "").trim(),
    text: (section < 0 ? rest : rest.slice(0, section)).join("\n").trim(),
  };
}

/** A stored decision or insight, read at full reach. */
export async function storedClaim(
  entityService: Pick<MemoryEntityService, "getEntity">,
  kind: ClaimKind,
  id: string,
): Promise<DecisionEntity | InsightEntity | null> {
  const visibilityScope = internalFullScope(
    "the pickup reads a claim it wrote or is about to write",
  );
  return kind === "insight"
    ? entityService.getEntity(
        { entityType: INSIGHT_ENTITY_TYPE, id, visibilityScope },
        insightSchema,
      )
    : entityService.getEntity(
        { entityType: DECISION_ENTITY_TYPE, id, visibilityScope },
        decisionSchema,
      );
}

/**
 * Say whether a claim the pickup wrote still holds, only while the claim
 * still reads as the pickup wrote it: `written` is the hash the bookmark
 * recorded. A claim edited since, or with no record, belongs to whoever
 * edited it and is left as it is. Returns the claim's title and the hash it
 * now has, to record in place of the old one.
 */
export async function rewriteOwnClaim(
  entityService: Pick<MemoryEntityService, "getEntity" | "updateEntity">,
  written: string | undefined,
  claim: { kind: ClaimKind; id: string },
  standing: Pick<MemorySource, "status" | "supersededBy">,
): Promise<{ title: string; hash: string } | undefined> {
  if (!written) return undefined;
  const entity = await storedClaim(entityService, claim.kind, claim.id);
  if (entity?.contentHash !== written) return undefined;
  const { supersededBy: _replaced, ...metadata } = entity.metadata;
  const result = await entityService.updateEntity({
    entity: {
      ...entity,
      metadata: {
        ...metadata,
        status: standing.status,
        ...(standing.supersededBy !== undefined && {
          supersededBy: standing.supersededBy,
        }),
      },
    },
    options: { expectedContentHash: written },
  });
  if (result.skipReason === "content-conflict") return undefined;
  const rewritten = await storedClaim(entityService, claim.kind, claim.id);
  return rewritten
    ? {
        title: headingAndText(rewritten.content).title,
        hash: rewritten.contentHash,
      }
    : undefined;
}

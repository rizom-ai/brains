import { internalFullScope } from "@brains/sdk/internal/service-runtime";
import {
  decisionSchema,
  type DecisionEntity,
  type DecisionMetadata,
} from "../../schemas/conversation-memory";
import { DECISION_ENTITY_TYPE } from "../constants";
import type { MemoryEntityService } from "../memory-context";

/** A decision's heading and the text under it, up to its first section. */
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

/**
 * Change the metadata of a decision the pickup wrote, only while the
 * decision still reads as the pickup wrote it: `written` is the hash the
 * bookmark recorded. A decision edited since, or with no record, belongs
 * to whoever edited it and is left as it is. Returns the decision's title
 * and the hash it now has, to record in place of the old one.
 */
export async function rewriteOwnDecision(
  entityService: Pick<MemoryEntityService, "getEntity" | "updateEntity">,
  written: string | undefined,
  id: string,
  change: (metadata: DecisionMetadata) => DecisionMetadata,
): Promise<{ title: string; hash: string } | undefined> {
  if (!written) return undefined;
  const read = (): Promise<DecisionEntity | null> =>
    entityService.getEntity(
      {
        entityType: DECISION_ENTITY_TYPE,
        id,
        visibilityScope: internalFullScope(
          "the pickup rewrites its own decision",
        ),
      },
      decisionSchema,
    );
  const entity = await read();
  if (entity?.contentHash !== written) return undefined;
  const result = await entityService.updateEntity({
    entity: { ...entity, metadata: change(entity.metadata) },
    options: { expectedContentHash: written },
  });
  if (result.skipReason === "content-conflict") return undefined;
  const rewritten = await read();
  return rewritten
    ? {
        title: headingAndText(rewritten.content).title,
        hash: rewritten.contentHash,
      }
    : undefined;
}

import { askContentFromRecord, type AskContent } from "@brains/contracts";
import type { InterfaceRuntime } from "@brains/sdk/internal/interface-runtime";

export function publicAskContent(
  entity: {
    visibility: string;
    content: string;
    metadata?: Record<string, unknown>;
  } | null,
): AskContent | undefined {
  if (entity?.visibility !== "public") return undefined;
  try {
    return askContentFromRecord(entity);
  } catch {
    // Malformed optional copy is omitted, never replaced with fallback prose.
    return undefined;
  }
}

/** Optional public copy: absence, private content and invalid authoring fail closed. */
export async function loadAskContent(
  entities: InterfaceRuntime["entityReads"],
): Promise<AskContent | undefined> {
  try {
    const entity = await entities.getEntity({
      entityType: "ask-content",
      id: "ask-content",
    });
    return publicAskContent(entity);
  } catch {
    // A missing entity plugin or malformed optional copy must not break chat.
    return undefined;
  }
}

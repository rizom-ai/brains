import { parseAskContent, type AskContent } from "@brains/contracts";
import type { InterfaceEntityReader } from "@brains/sdk/interfaces";

export function publicAskContent(
  entity: { visibility: string; content: string } | null,
): AskContent | undefined {
  if (entity?.visibility !== "public") return undefined;
  try {
    return parseAskContent(entity.content);
  } catch {
    // Malformed optional copy is omitted, never replaced with fallback prose.
    return undefined;
  }
}

/** Optional public copy: absence, private content and invalid authoring fail closed. */
export async function loadAskContent(
  entities: Pick<InterfaceEntityReader, "getEntity">,
): Promise<AskContent | undefined> {
  try {
    const entity = await entities.getEntity({
      entityType: "ask-content",
      id: "ask-content",
      visibilityScope: "public",
    });
    return publicAskContent(entity);
  } catch {
    // A missing entity plugin or malformed optional copy must not break chat.
    return undefined;
  }
}

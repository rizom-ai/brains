import type { EntityDetail } from "./api";

/**
 * Mutable editor input is deliberately detached from the cached server
 * snapshot. Query cache updates never replace a dirty draft implicitly.
 */
export interface EditorDocument {
  entity: EntityDetail;
  draft: Record<string, unknown>;
  body: string;
}

export function createEditorDocument(entity: EntityDetail): EditorDocument {
  return {
    entity,
    draft: { ...entity.frontmatter },
    body: entity.body,
  };
}

import { frontmatterRecordFields } from "@brains/contracts";
import {
  deckFrontmatterSchema,
  type DeckEntity,
  type DeckWithData,
} from "../schemas/deck";

/**
 * A deck with its frontmatter and its slides, whichever way it was read: a
 * declared deck's content is its slides and its frontmatter its metadata;
 * a document carries its frontmatter in its content.
 */
export function parseDeckData(entity: DeckEntity): DeckWithData {
  const { fields, body } = frontmatterRecordFields(entity);
  return { ...entity, frontmatter: deckFrontmatterSchema.parse(fields), body };
}

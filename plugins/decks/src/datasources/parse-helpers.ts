import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import {
  deckFrontmatterSchema,
  type DeckEntity,
  type DeckWithData,
} from "../schemas/deck";

export function parseDeckData(entity: DeckEntity): DeckWithData {
  const { metadata: frontmatter, content: body } = parseMarkdownWithFrontmatter(
    entity.content,
    deckFrontmatterSchema,
  );
  return { ...entity, frontmatter, body };
}

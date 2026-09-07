import { parseMarkdown } from "@brains/utils/markdown";
import {
  askContentFrontmatterSchema,
  askContentSchema,
  type AskContent,
} from "./ask-content";

/** Server-side authoring parser. Keep markdown dependencies out of the browser Chat contract. */
export function parseAskContent(markdown: string): AskContent {
  const { frontmatter, content } = parseMarkdown(markdown);
  return askContentSchema.parse({
    ...askContentFrontmatterSchema.parse(frontmatter),
    ...(content.trim() ? { introduction: content.trim() } : {}),
  });
}

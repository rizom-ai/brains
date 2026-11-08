import { parseMarkdown } from "@brains/utils/markdown-frontmatter";
import {
  askContentFrontmatterSchema,
  askContentSchema,
  type AskContent,
} from "./ask-content";
import { frontmatterRecordFields, type FrontmatterRecord } from "./style-guide";

function askContent(fields: unknown, body: string): AskContent {
  return askContentSchema.parse({
    ...askContentFrontmatterSchema.parse(fields),
    ...(body.trim() ? { introduction: body.trim() } : {}),
  });
}

/** Server-side authoring parser. Keep markdown dependencies out of the browser Chat contract. */
export function parseAskContent(markdown: string): AskContent {
  const { frontmatter, content } = parseMarkdown(markdown);
  return askContent(frontmatter, content);
}

/** The Ask presentation a stored ask-content record holds, however it was read. */
export function askContentFromRecord(record: FrontmatterRecord): AskContent {
  const { fields, body } = frontmatterRecordFields(record);
  return askContent(fields, body);
}

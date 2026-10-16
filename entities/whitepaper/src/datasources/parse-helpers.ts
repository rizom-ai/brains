import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import type { Whitepaper } from "../schemas/whitepaper";
import {
  whitepaperFrontmatterSchema,
  whitepaperWithDataSchema,
  type WhitepaperWithData,
} from "../schemas/whitepaper";

export function parseWhitepaperData(entity: Whitepaper): WhitepaperWithData {
  const parsed = parseMarkdownWithFrontmatter(
    entity.content,
    whitepaperFrontmatterSchema,
  );
  return whitepaperWithDataSchema.parse({
    ...entity,
    frontmatter: parsed.metadata,
    body: parsed.content,
  });
}

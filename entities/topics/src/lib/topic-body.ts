import {
  generateMarkdownWithFrontmatter,
  parseMarkdown,
} from "@brains/sdk/entities";
import { topicFrontmatterSchema } from "../schemas/topic";

export interface TopicBody {
  content: string;
  formatted: string;
  title: string;
}

const UNTITLED = "Unknown Topic";

/**
 * A topic stores its title in content frontmatter rather than in metadata,
 * because a topic's metadata is empty by design — everything about it is
 * the prose it derived.
 *
 * Tolerant of malformed bodies: a topic that fails to parse still renders
 * as its raw text rather than breaking the page that lists it.
 */
export function parseTopicBody(body: string): TopicBody {
  if (!body.startsWith("---")) {
    return { content: body, formatted: body, title: UNTITLED };
  }
  const parsed = topicFrontmatterSchema.safeParse(
    parseMarkdown(body).frontmatter,
  );
  if (!parsed.success) {
    return { content: body, formatted: body, title: UNTITLED };
  }
  return {
    // Legacy shape: topics used to carry a trailing "## Sources" section
    // that provenance now records properly, and stored entities written
    // before that change still have one. Tracked as `topic-entity-shape` in
    // docs/legacy-code-inventory.json.
    content: parseMarkdown(body)
      .content.replace(/\n*## Sources[\s\S]*$/, "")
      .trim(),
    formatted: body,
    title: parsed.data.title,
  };
}

export function createTopicBody(params: {
  title: string;
  content: string;
}): string {
  return generateMarkdownWithFrontmatter(params.content, {
    title: params.title,
  });
}

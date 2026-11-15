import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  parseTypedFrontmatter,
} from "@brains/sdk/internal/entity-runtime";
import { z } from "@brains/utils/zod";
import { topicFrontmatterSchema, type TopicBody } from "../schemas/topic";
import { TOPIC_ENTITY_TYPE } from "./constants";

const anyFrontmatter = z.record(z.string(), z.unknown());

/** A topic's body without the legacy Sources section old topics kept. */
export function withoutLegacySources(body: string): string {
  return body.replace(/\n*## Sources[\s\S]*$/, "").trim();
}

/**
 * A topic's document as its readers take it: its title from the header and
 * its body without the legacy Sources section. Stored content is
 * hand-editable, so a header that does not parse is a user state rather
 * than a fault: the raw document still renders, under "Unknown Topic".
 */
function parseTopicBody(
  body: string,
): TopicBody & { formatted: string; title: string } {
  if (body.startsWith("---")) {
    try {
      const frontmatter = parseTypedFrontmatter(
        TOPIC_ENTITY_TYPE,
        body,
        topicFrontmatterSchema,
      );
      const bodyText = parseMarkdownWithFrontmatter(
        body,
        anyFrontmatter,
      ).content;
      return {
        content: withoutLegacySources(bodyText),
        formatted: body,
        title: frontmatter.title,
      };
    } catch {
      // A hand-edited header that does not parse renders as written.
      return { content: body, formatted: body, title: "Unknown Topic" };
    }
  }
  return { content: body, formatted: body, title: "Unknown Topic" };
}

/** A topic's document: its title as the header, its text as the body. */
function createTopicBody(params: { title: string; content: string }): string {
  return generateMarkdownWithFrontmatter(params.content, {
    title: params.title,
  });
}

/**
 * How a topic's document is read and written, as the topics class's
 * adapter read and wrote it. A topic is read as its stored document.
 */
export const topicDocument: {
  parseTopicBody: typeof parseTopicBody;
  createTopicBody: typeof createTopicBody;
} = Object.freeze({ parseTopicBody, createTopicBody });

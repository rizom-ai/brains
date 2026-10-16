import * as yaml from "js-yaml";
import { frontmatterSchema } from "./frontmatter-schema";

/** Frontmatter-only operations must not initialize the Markdown AST pipeline.
 * This module is also used by headless contracts and browser clients.
 */
export interface MarkdownFrontmatter {
  data: unknown;
  content: string;
  language: "yaml" | "json";
}

/** Read frontmatter without trimming the body or retaining document contents.
 * Schema validation belongs to the caller; scalar documents remain scalars.
 * Only data languages are supported, never executable frontmatter engines.
 */
export function readMarkdownFrontmatter(markdown: string): MarkdownFrontmatter {
  const normalized = markdown.startsWith("\uFEFF")
    ? markdown.slice(1)
    : markdown;
  if (!normalized.startsWith("---") || normalized[3] === "-") {
    return { data: {}, content: normalized, language: "yaml" };
  }
  let remaining = normalized.slice(3);
  const header = remaining.slice(0, remaining.search(/\r?\n/));
  const label = header.trim();
  let language: "yaml" | "json" = "yaml";
  if (label) {
    if (label.toLowerCase() === "yaml" || label.toLowerCase() === "yml") {
      language = "yaml";
    } else if (label === "json") {
      language = "json";
    } else {
      throw new Error(`Unsupported frontmatter language: ${label}`);
    }
    remaining = remaining.slice(header.length);
  }
  const close = remaining.indexOf("\n---");
  const block = close === -1 ? remaining : remaining.slice(0, close);
  const content =
    close === -1
      ? ""
      : remaining
          .slice(close + 4)
          .replace(/^\r/, "")
          .replace(/^\n/, "");
  const empty = block.replace(/^\s*#[^\n]+/gm, "").trim() === "";
  const data: unknown = empty
    ? {}
    : language === "json"
      ? JSON.parse(block)
      : yaml.load(block, { schema: frontmatterSchema });
  return { data: data ?? {}, content, language };
}

function fieldRecord(data: unknown): Record<string, unknown> {
  if (data === null || (typeof data !== "object" && typeof data !== "string")) {
    return {};
  }
  const entries: [string, unknown][] = Object.entries(data);
  return Object.fromEntries(entries);
}

export function parseMarkdown(
  markdown: string,
  _options?: { cache?: boolean },
): {
  frontmatter: Record<string, unknown>;
  content: string;
} {
  // All reads are stateless, including the existing cache:false read contract.
  const { data, content } = readMarkdownFrontmatter(markdown);
  return { frontmatter: fieldRecord(data), content: content.trim() };
}

function newline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

export function generateMarkdown(
  frontmatter: Record<string, unknown>,
  content: string,
): string {
  const parsed = readMarkdownFrontmatter(content);
  const fields = { ...fieldRecord(parsed.data), ...frontmatter };
  const serialized = (
    parsed.language === "json"
      ? JSON.stringify(fields, null, 2)
      : yaml.dump(fields, { schema: frontmatterSchema })
  ).trim();
  const prefix = serialized === "{}" ? "" : `---\n${serialized}\n---\n`;
  return prefix + newline(parsed.content);
}

/** Update a single field while preserving all other frontmatter fields. */
export function updateFrontmatterField(
  markdown: string,
  field: string,
  value: unknown,
): string {
  const { frontmatter, content } = parseMarkdown(markdown);
  if (value === null || value === undefined) delete frontmatter[field];
  else frontmatter[field] = value;
  return generateMarkdown(frontmatter, content);
}

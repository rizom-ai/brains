import {
  StructuredContentFormatter,
  type FieldMapping,
} from "@brains/content-formatters";
import { parseMarkdown } from "@brains/utils/markdown-frontmatter";
import { z } from "@brains/utils/zod";
import { quizResultFrontmatterSchema } from "./schema";

// Legacy: also reads the header form written before 0.2.0-alpha.760; removed with stored-form-old-headers (docs/legacy-code-inventory.json).

/*
 * A quiz result's next stored form (docs/external-plugin-authoring.md, The stored format): what
 * was answered and shown moves from the header to the body, under
 * "## Results" and "## Answers". A result is headed by its title, its
 * dimension and outcome labeled lines; an answer is headed by its question,
 * its field a labeled line, and what was given under it: its text, or the
 * choices as a list.
 */

const BODY_KEYS: ReadonlySet<string> = new Set(["results", "answers"]);
const FIELD_LINE = /^- \*\*Field:\*\* (.+)$/u;
const LIST_ITEM = /^- /u;

const answerSchema = z.object({
  field: z.string(),
  label: z.string(),
  value: z.union([z.string(), z.array(z.string())]),
});

/** Text that would read back as a list escapes its first marker. */
function answerText(value: string): string {
  const lines = value.split("\n").filter((line) => line.trim() !== "");
  return lines.length > 0 && lines.every((line) => LIST_ITEM.test(line))
    ? `\\${value}`
    : value;
}

function formatAnswers(value: unknown): string {
  return z
    .array(answerSchema)
    .parse(value)
    .map((answer) =>
      [
        `### ${answer.label}`,
        `- **Field:** ${answer.field}`,
        Array.isArray(answer.value)
          ? answer.value.map((choice) => `- ${choice}`).join("\n")
          : answerText(answer.value),
      ].join("\n\n"),
    )
    .join("\n\n");
}

function parseAnswers(text: string): unknown[] {
  return `\n${text}`
    .split(/\n### /u)
    .slice(1)
    .map((item) => {
      const [label = "", ...rest] = item.split("\n");
      const lines = rest.join("\n").trim().split("\n");
      const field = FIELD_LINE.exec(lines[0] ?? "")?.[1]?.trim();
      const given = lines.slice(1).join("\n").trim();
      const choices = given.split("\n");
      const value =
        given.length > 0 && choices.every((line) => LIST_ITEM.test(line))
          ? choices.map((line) => line.slice(2))
          : given.replace(/^\\(?=- )/u, "");
      return { field, label: label.trim(), value };
    });
}

const bodySchema = quizResultFrontmatterSchema.pick({
  results: true,
  answers: true,
});

const bodyMappings: FieldMapping[] = [
  {
    key: "results",
    label: "Results",
    type: "array",
    itemType: "object",
    itemTitle: "title",
    itemMappings: [
      { key: "title", label: "Title", type: "string" },
      { key: "dimension", label: "Dimension", type: "string", line: true },
      { key: "outcome", label: "Outcome", type: "string", line: true },
      {
        key: "outcomeTitle",
        label: "Outcome title",
        type: "string",
        line: true,
      },
    ],
  },
  {
    key: "answers",
    label: "Answers",
    type: "custom",
    formatter: formatAnswers,
    parser: parseAnswers,
  },
];

const bodyFormatter = new StructuredContentFormatter(bodySchema, {
  title: "Quiz result",
  layout: "compact",
  mappings: bodyMappings,
});

/** The next form's header: what the result is, without what was answered. */
export const quizResultNextHeaderSchema: z.ZodObject =
  quizResultFrontmatterSchema.omit({ results: true, answers: true });

/**
 * A stored result in either form with what was answered in its header,
 * as the current form holds it.
 */
export function inCurrentShape(document: {
  readonly content: string;
  readonly frontmatter: Record<string, unknown>;
}): { content: string; frontmatter: Record<string, unknown> } {
  if ([...BODY_KEYS].some((key) => Object.hasOwn(document.frontmatter, key)))
    return { content: document.content, frontmatter: document.frontmatter };
  if (document.content.trim() === "")
    return { content: document.content, frontmatter: document.frontmatter };
  return {
    content: "",
    frontmatter: {
      ...document.frontmatter,
      ...bodyFormatter.parse(document.content),
    },
  };
}

/** A whole document in either form, its header in the current shape. */
export function currentHeaderOf(content: string): Record<string, unknown> {
  const parsed = parseMarkdown(content);
  return inCurrentShape({
    content: parsed.content,
    frontmatter: parsed.frontmatter,
  }).frontmatter;
}

/** A result's next-form header and body, from its current-shape header. */
export function inNextForm(header: Record<string, unknown>): {
  content: string;
  frontmatter: Record<string, unknown>;
} {
  const body = Object.fromEntries(
    Object.entries(header).filter(([key]) => BODY_KEYS.has(key)),
  );
  return {
    // A field write's bare body states the indexed fields alone: what was
    // answered stays as stored.
    content:
      Object.keys(body).length === 0
        ? ""
        : bodyFormatter.format(bodySchema.parse(body)),
    frontmatter: Object.fromEntries(
      Object.entries(header).filter(([key]) => !BODY_KEYS.has(key)),
    ),
  };
}

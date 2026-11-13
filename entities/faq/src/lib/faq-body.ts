import { StructuredContentFormatter } from "@brains/content-formatters";
import { frontmatterRecordFields } from "@brains/contracts";
import { generateMarkdownWithFrontmatter } from "@brains/sdk/internal/entity-runtime";
import { z } from "@brains/utils/zod";
import {
  faqBodySchema,
  faqFrontmatterSchema,
  faqSourceSchema,
  type FaqAlternative,
  type FaqBody,
  type FaqFrontmatter,
  type FaqFrontmatterInput,
  type FaqMetadata,
  type FaqSource,
} from "../schemas/faq";
import {
  hasStoredExcerpts,
  isStoredFaqBody,
  parseStoredFaqBody,
  withoutStoredExcerpts,
} from "./stored-body";

/** The query-friendly metadata a FAQ's frontmatter implies. */
export function faqMetadata(frontmatter: FaqFrontmatter): FaqMetadata {
  return {
    question: frontmatter.question,
    status: frontmatter.status,
    asked: frontmatter.asked,
    ...(frontmatter.rank !== undefined && { rank: frontmatter.rank }),
  };
}

/**
 * One source as a list item: its title linked to its address (the brain's
 * reference to it rides as the link title when it has a public address)
 * and the brain it came from.
 */
const SOURCE_LINE =
  /^- \[((?:\\.|[^\]\\])+)\]\((<[^>]*>|\S+?)(?: "([^"]+)")?\)(?: — from (?:\[((?:\\.|[^\]\\])+)\]\((\S+?)\)|(.+)))?$/;

const HTTP_URL = /^https?:\/\//;

function escapeLinkText(text: string): string {
  return text.replace(/[\\[\]]/g, (character) => `\\${character}`);
}

function unescapeLinkText(text: string): string {
  return text.replace(/\\([\\[\]])/g, "$1");
}

function sourceItem(source: FaqSource): string {
  const title = escapeLinkText(source.title);
  // A reference with spaces is no bare link target; angle brackets keep it.
  const reference = /[\s()]/.test(source.id) ? `<${source.id}>` : source.id;
  const link = source.url
    ? `[${title}](${source.url} "${source.id}")`
    : `[${title}](${reference})`;
  const brain = source.brain
    ? ` — from ${
        source.brain.url
          ? `[${escapeLinkText(source.brain.name)}](${source.brain.url})`
          : source.brain.name
      }`
    : "";
  return `- ${link}${brain}`;
}

/**
 * A source read back from its list item. A line that is not one comes back
 * without an id, so the body fails validation instead of losing it.
 */
function parseSourceItem(line: string): FaqSource {
  const match = SOURCE_LINE.exec(line);
  if (!match) return { id: "", title: line };
  const [
    ,
    rawTitle = "",
    target = "",
    reference,
    brainLinked,
    brainUrl,
    brainPlain,
  ] = match;
  const brainName = brainLinked
    ? unescapeLinkText(brainLinked)
    : brainPlain?.trim();
  const destination = target.replace(/^<(.*)>$/, "$1");
  return {
    id: reference ?? destination,
    title: unescapeLinkText(rawTitle),
    ...(HTTP_URL.test(destination) ? { url: destination } : {}),
    ...(brainName
      ? { brain: { name: brainName, ...(brainUrl ? { url: brainUrl } : {}) } }
      : {}),
  };
}

/** The Sources section's markdown back as sources, one per list item. */
function parseSources(markdown: string): FaqSource[] {
  return withoutStoredExcerpts(markdown)
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => parseSourceItem(line.trim()));
}

/** Markdown body ↔ FAQ body, through the structured content formatter. */
export const faqBodyFormatter: StructuredContentFormatter<FaqBody> =
  new StructuredContentFormatter(faqBodySchema, {
    title: "FAQ",
    mappings: [
      { key: "answer", label: "Answer", type: "string" },
      {
        key: "sources",
        label: "Sources",
        type: "custom",
        formatter: (value: unknown): string =>
          z.array(faqSourceSchema).parse(value).map(sourceItem).join("\n"),
        parser: parseSources,
      },
      {
        key: "alternatives",
        label: "Alternative answers",
        type: "array",
        itemType: "object",
        itemMappings: [{ key: "answer", label: "Answer", type: "string" }],
      },
    ],
  });

/** Markdown body ↔ FAQ body; a write is validated like a read. */
export const faqBodyCodec: typeof faqBodyFormatter.codec =
  faqBodyFormatter.codec;

/** A FAQ as its readers take it: its fields, its answer, sources and alternatives. */
export interface FaqParts {
  frontmatter: FaqFrontmatter;
  answer: string;
  sources: FaqSource[];
  alternatives: FaqAlternative[];
}

/** The body in the formatter's layout; empty lists are left out. */
export function faqBody(
  answer: string,
  sources: FaqSource[] = [],
  alternatives: FaqAlternative[] = [],
): string {
  return z.encode(faqBodyCodec, {
    answer,
    ...(sources.length > 0 ? { sources } : {}),
    ...(alternatives.length > 0 ? { alternatives } : {}),
  });
}

/** A body's answer, sources and alternatives, whichever layout it is in. */
function bodyParts(
  body: string,
  frontmatterSources: FaqSource[],
): Omit<FaqParts, "frontmatter"> {
  const parsed = isStoredFaqBody(body)
    ? parseStoredFaqBody(body)
    : z.decode(faqBodyCodec, body);
  const sources = "sources" in parsed ? (parsed.sources ?? []) : [];
  return {
    answer: parsed.answer,
    sources: sources.length > 0 ? sources : frontmatterSources,
    alternatives: parsed.alternatives ?? [],
  };
}

/**
 * The body as stored, unless the FAQ is still in the layout from before
 * the formatter, keeps its sources in frontmatter or keeps what they
 * quoted: then it is written in the formatter's layout, sources in the
 * body without quotes, as the class wrote it on its next write.
 */
export function currentFaqBody(
  body: string,
  frontmatterSources: FaqSource[],
): string {
  if (
    !isStoredFaqBody(body) &&
    !hasStoredExcerpts(body) &&
    frontmatterSources.length === 0
  )
    return body;
  const { answer, sources, alternatives } = bodyParts(body, frontmatterSources);
  return faqBody(answer, sources, alternatives);
}

/** Sources an FAQ kept in its frontmatter before they moved to the body. */
const storedSourcesSchema = z.looseObject({
  sources: z.array(faqSourceSchema).optional(),
});

/** The sources a FAQ's frontmatter still holds, from before they moved. */
export function frontmatterSources(frontmatter: unknown): FaqSource[] {
  const parsed = storedSourcesSchema.safeParse(frontmatter);
  return parsed.success ? (parsed.data.sources ?? []) : [];
}

/**
 * A FAQ as read: its fields from the stored document when it is read as
 * stored, from its metadata otherwise, and its body's answer, sources and
 * alternatives.
 */
export function readFaq(record: {
  readonly content: string;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}): FaqParts {
  const { fields, body } = frontmatterRecordFields(record);
  return {
    frontmatter: faqFrontmatterSchema.parse(fields),
    ...bodyParts(body, frontmatterSources(fields)),
  };
}

/**
 * The document a FAQ is stored and embedded as: its fields over its body.
 * A same-question search and check measure a FAQ in this form.
 */
export function faqDocument(
  frontmatter: FaqFrontmatterInput,
  answer: string,
  alternatives: FaqAlternative[] = [],
  sources: FaqSource[] = [],
): string {
  return generateMarkdownWithFrontmatter(
    faqBody(answer, sources, alternatives),
    faqFrontmatterSchema.parse(frontmatter),
  );
}

/** What a FAQ write stores: its body, and its fields as metadata. */
export function faqRecord(
  frontmatter: FaqFrontmatterInput,
  answer: string,
  alternatives: FaqAlternative[] = [],
  sources: FaqSource[] = [],
): { content: string; metadata: FaqMetadata } {
  return {
    content: faqBody(answer, sources, alternatives),
    metadata: faqMetadata(faqFrontmatterSchema.parse(frontmatter)),
  };
}

import { StructuredContentFormatter } from "@brains/content-formatters";
import { BaseEntityAdapter } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  faqBodySchema,
  faqFrontmatterSchema,
  faqSchema,
  faqSourceSchema,
  type FaqAlternative,
  type FaqBody,
  type FaqEntity,
  type FaqFrontmatter,
  type FaqFrontmatterInput,
  type FaqMetadata,
  type FaqSource,
} from "../schemas/faq";
import { isStoredFaqBody, parseStoredFaqBody } from "./stored-body";

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
 * reference to it rides as the link title when it has a public address),
 * the brain it came from, and what it said as a quote below.
 */
const SOURCE_LINE =
  /^- \[((?:\\.|[^\]\\])+)\]\((<[^>]*>|\S+?)(?: "([^"]+)")?\)(?: — from (?:\[((?:\\.|[^\]\\])+)\]\((\S+?)\)|(.+)))?$/;

const QUOTE_LINE = /^\s*>\s?(.*)$/;

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
  const quote = source.excerpt
    ? source.excerpt
        .split("\n")
        .map((line) => (line ? `\n  > ${line}` : "\n  >"))
        .join("")
    : "";
  return `- ${link}${brain}${quote}`;
}

/**
 * A source read back from its list item. A line that is not one comes back
 * without an id, so the body fails validation instead of losing it.
 */
function parseSourceItem(line: string, quote: string[]): FaqSource {
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
  const excerpt = quote.join("\n").trim();
  const destination = target.replace(/^<(.*)>$/, "$1");
  return {
    id: reference ?? destination,
    title: unescapeLinkText(rawTitle),
    ...(HTTP_URL.test(destination) ? { url: destination } : {}),
    ...(excerpt ? { excerpt } : {}),
    ...(brainName
      ? { brain: { name: brainName, ...(brainUrl ? { url: brainUrl } : {}) } }
      : {}),
  };
}

/** The Sources section's markdown back as sources: items, each with its quote. */
function parseSources(markdown: string): FaqSource[] {
  const items = markdown
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .reduce<Array<{ line: string; quote: string[] }>>((list, line) => {
      const quote = QUOTE_LINE.exec(line);
      const last = list.at(-1);
      if (quote && last) last.quote.push(quote[1] ?? "");
      else list.push({ line: line.trim(), quote: [] });
      return list;
    }, []);
  return items.map(({ line, quote }) => parseSourceItem(line, quote));
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

/** Sources an FAQ kept in its frontmatter before they moved to the body. */
const storedSourcesSchema = z.object({
  sources: z.array(faqSourceSchema).optional(),
});

export class FaqAdapter extends BaseEntityAdapter<
  FaqEntity,
  FaqMetadata,
  FaqFrontmatter
> {
  constructor() {
    super({
      entityType: "faq",
      purpose:
        "A reusable question and answer captured from a chat conversation, kept at the visibility of the turn that answered it.",
      schema: faqSchema,
      frontmatterSchema: faqFrontmatterSchema,
    });
  }

  public createFaqContent(
    frontmatter: FaqFrontmatterInput,
    answer: string,
    alternatives: FaqAlternative[] = [],
    sources: FaqSource[] = [],
  ): string {
    return this.buildMarkdown(
      this.encodeBody(answer, sources, alternatives),
      faqFrontmatterSchema.parse(frontmatter),
    );
  }

  public parseFaqContent(content: string): {
    frontmatter: FaqFrontmatter;
    answer: string;
    sources: FaqSource[];
    alternatives: FaqAlternative[];
  } {
    // Parse through the schema to apply defaults (asked)
    const raw = this.parseFrontMatter(content, faqFrontmatterSchema);
    const body = this.extractBody(content);
    const parsed = isStoredFaqBody(body)
      ? parseStoredFaqBody(body)
      : z.decode(faqBodyCodec, body);
    const sources = "sources" in parsed ? (parsed.sources ?? []) : [];
    return {
      frontmatter: faqFrontmatterSchema.parse(raw),
      answer: parsed.answer,
      sources: sources.length > 0 ? sources : this.storedSources(content),
      alternatives: parsed.alternatives ?? [],
    };
  }

  public fromMarkdown(markdown: string): Partial<FaqEntity> {
    const { frontmatter } = this.parseFaqContent(markdown);
    return {
      content: markdown,
      entityType: "faq",
      metadata: faqMetadata(frontmatter),
    };
  }

  /**
   * The body as stored, unless the FAQ is still in the layout from before
   * the formatter or keeps its sources in frontmatter: then it is written in
   * the formatter's layout, sources in the body.
   */
  protected override renderBody(entity: FaqEntity): string {
    const body = this.extractBody(entity.content);
    if (
      !isStoredFaqBody(body) &&
      this.storedSources(entity.content).length === 0
    )
      return body;
    const { answer, sources, alternatives } = this.parseFaqContent(
      entity.content,
    );
    return this.encodeBody(answer, sources, alternatives);
  }

  /** Empty lists are left out, so the body has no empty sections. */
  private encodeBody(
    answer: string,
    sources: FaqSource[],
    alternatives: FaqAlternative[],
  ): string {
    return z.encode(faqBodyCodec, {
      answer,
      ...(sources.length > 0 ? { sources } : {}),
      ...(alternatives.length > 0 ? { alternatives } : {}),
    });
  }

  /** Sources still in an FAQ's frontmatter, from before they moved. */
  private storedSources(content: string): FaqSource[] {
    return this.parseFrontMatter(content, storedSourcesSchema).sources ?? [];
  }
}

export const faqAdapter: FaqAdapter = new FaqAdapter();

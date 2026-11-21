import {
  StructuredContentFormatter,
  fieldMappingsFromSchema,
} from "@brains/content-formatters";
import {
  generateMarkdownWithFrontmatter,
  parseTypedFrontmatter,
} from "@brains/sdk/internal/entity-runtime";
import { parseMarkdown } from "@brains/utils/markdown-frontmatter";
import { z } from "@brains/utils/zod";
import {
  swotFrontmatterSchema,
  swotItemSchema,
  type SwotFrontmatter,
} from "../schemas/swot";

/*
 * A SWOT's markdown. The current stored form, as the swot adapter wrote
 * it, is all header. The next (docs/plans/one-stored-form.md) keeps the
 * time it was derived in the header and states each quadrant in the body,
 * one heading per quadrant and one per item, its detail as plain text;
 * text an author added above the quadrants stays there.
 */

const QUADRANTS = [
  "strengths",
  "weaknesses",
  "opportunities",
  "threats",
] as const;

const QUADRANT_KEYS: ReadonlySet<string> = new Set(QUADRANTS);

const quadrantList = z
  .array(swotItemSchema)
  .optional()
  .meta({ itemTitle: "title" });

const quadrantsSchema = z.object({
  strengths: quadrantList,
  weaknesses: quadrantList,
  opportunities: quadrantList,
  threats: quadrantList,
});

const quadrantsFormatter = new StructuredContentFormatter(quadrantsSchema, {
  title: "SWOT",
  layout: "compact",
  mappings: fieldMappingsFromSchema(quadrantsSchema),
});

/** The next form's header: the time the SWOT was derived. */
export const swotNextHeaderSchema: z.ZodObject = swotFrontmatterSchema.pick({
  derivedAt: true,
});

/** A SWOT document: its quadrants and the time it was derived, as header. */
export function createSwotContent(input: SwotFrontmatter): string {
  return generateMarkdownWithFrontmatter("", input);
}

/** A body's text above its first section, and the sections from there. */
function splitLead(body: string): { lead: string; sections: string } {
  const at = `\n${body}`.search(/\n## /u);
  return at < 0
    ? { lead: body, sections: "" }
    : { lead: body.slice(0, at), sections: body.slice(at) };
}

/**
 * A stored SWOT in either form, its quadrants in the header and its body
 * the text an author added, as the current form holds them.
 */
export function swotInCurrentShape(document: {
  readonly content: string;
  readonly frontmatter: Record<string, unknown>;
}): { content: string; frontmatter: Record<string, unknown> } {
  if (QUADRANTS.some((key) => Object.hasOwn(document.frontmatter, key)))
    return { content: document.content, frontmatter: document.frontmatter };
  const { lead, sections } = splitLead(document.content);
  if (sections.length === 0)
    return { content: document.content, frontmatter: document.frontmatter };
  return {
    content: lead,
    frontmatter: {
      ...document.frontmatter,
      ...quadrantsFormatter.parse(sections),
    },
  };
}

/** A SWOT's quadrants and the time it was derived, from its document in either form. */
export function parseSwotContent(content: string): {
  frontmatter: SwotFrontmatter;
} {
  const parsed = parseMarkdown(content);
  const current = swotInCurrentShape({
    content: parsed.content,
    frontmatter: parsed.frontmatter,
  });
  return {
    frontmatter: parseTypedFrontmatter(
      "swot",
      generateMarkdownWithFrontmatter(current.content, current.frontmatter),
      swotFrontmatterSchema,
    ),
  };
}

/**
 * A SWOT's next-form header and body, from the header and body of the
 * current shape a write states: the quadrants move under the author's
 * text, an empty quadrant left out.
 */
export function swotInNextForm(document: {
  readonly content: string;
  readonly frontmatter: Record<string, unknown>;
}): { content: string; frontmatter: Record<string, unknown> } {
  const header = Object.fromEntries(
    Object.entries(document.frontmatter).filter(
      ([key]) => !QUADRANT_KEYS.has(key),
    ),
  );
  const quadrants = Object.fromEntries(
    QUADRANTS.flatMap((key) => {
      const items = z
        .array(swotItemSchema)
        .catch([])
        .parse(document.frontmatter[key] ?? []);
      return items.length > 0 ? [[key, items]] : [];
    }),
  );
  const body = quadrantsFormatter.format(quadrants);
  const lead = document.content.replace(/\n+$/u, "");
  return {
    content: lead.length > 0 ? `${lead}\n\n${body}` : body,
    frontmatter: header,
  };
}

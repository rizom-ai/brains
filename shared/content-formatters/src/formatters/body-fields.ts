import { z } from "@brains/utils/zod";
import {
  StructuredContentFormatter,
  fieldMappingsFromSchema,
  type FieldMapping,
} from "./structured-content";

/** A body's text above its first section, and the sections from there. */
export function leadAndSections(body: string): {
  lead: string;
  sections: string;
} {
  const at = `\n${body}`.search(/\n## /u);
  if (at < 0) return { lead: body, sections: "" };
  const lead = body.slice(0, at);
  return {
    // The author's text ends on one newline; blank text is none.
    lead: lead.trim() === "" ? "" : lead.replace(/\n+$/u, "\n"),
    sections: body.slice(at),
  };
}

const FENCE = /^\s*(```|~~~)/u;

/**
 * A body's leading sections whose headings name a field, and the body
 * after them; a heading inside a code block is not a section.
 */
function leadingSections(
  body: string,
  labels: ReadonlySet<string>,
): { sections: string; rest: string } {
  const lines = body.split("\n");
  const headings = lines.reduce<{ fenced: boolean; at: number[] }>(
    (state, line, index) => {
      if (FENCE.test(line)) return { ...state, fenced: !state.fenced };
      return !state.fenced && line.startsWith("## ")
        ? { ...state, at: [...state.at, index] }
        : state;
    },
    { fenced: false, at: [] },
  ).at;
  const opening = lines.findIndex((line) => line.trim() !== "");
  if (headings[0] === undefined || headings[0] !== opening)
    return { sections: "", rest: body };
  const named = (index: number): boolean =>
    labels.has((lines[index] ?? "").slice(3).trim().toLowerCase());
  const cut = headings.find((index) => !named(index)) ?? lines.length;
  if (!named(opening)) return { sections: "", rest: body };
  return {
    sections: lines.slice(0, cut).join("\n"),
    rest: lines.slice(cut).join("\n"),
  };
}

/**
 * How a type's next stored form (docs/plans/one-stored-form.md) states
 * some of its header fields in its body: one section per field, in the
 * compact layout, under the text its author wrote.
 */
export interface BodyFields {
  /** The next form's header: every field but the moved ones. */
  readonly nextHeader: z.ZodObject;
  /**
   * A document in either form, its fields in the header as the current
   * form holds them, and the text its author wrote. Sections that do not
   * read as the fields are the author's text.
   */
  read(
    header: Readonly<Record<string, unknown>>,
    body: string,
  ): { header: Record<string, unknown>; lead: string };
  /** The next form's header and body, from every field and the author's text. */
  write(
    fields: Readonly<Record<string, unknown>>,
    lead: string,
  ): { header: Record<string, unknown>; body: string };
}

/**
 * The body fields of a type whose schema is `schema`: `fields` move to the
 * body, in their order, each under the label its schema gives it; below
 * the author's text (the default), or above the body its author wrote,
 * for a body that is itself sections.
 */
export function bodyFields(
  schema: z.ZodObject,
  fields: readonly string[],
  options: {
    readonly mappings?: FieldMapping[];
    readonly place?: "below" | "above";
  } = {},
): BodyFields {
  const { mappings } = options;
  const above = options.place === "above";
  const moved: ReadonlySet<string> = new Set(fields);
  const bodySchema = z.object(
    Object.fromEntries(
      fields.flatMap((key) => {
        const field = schema.shape[key];
        return field ? [[key, z.optional(field)]] : [];
      }),
    ),
  );
  const fieldMappings = mappings ?? fieldMappingsFromSchema(bodySchema);
  const formatter = new StructuredContentFormatter(bodySchema, {
    title: "",
    layout: "compact",
    mappings: fieldMappings,
  });
  const labels: ReadonlySet<string> = new Set(
    fieldMappings.map((mapping) => mapping.label.toLowerCase()),
  );
  return {
    nextHeader: z.object(
      Object.fromEntries(
        Object.entries(schema.shape).filter(([key]) => !moved.has(key)),
      ),
    ),
    read(header, body): { header: Record<string, unknown>; lead: string } {
      if (fields.some((key) => Object.hasOwn(header, key)))
        return { header: { ...header }, lead: body };
      const leading = above ? leadingSections(body, labels) : undefined;
      const { lead, sections } = leading
        ? {
            sections: leading.sections,
            lead: leading.rest.replace(/^\n+/u, ""),
          }
        : leadAndSections(body);
      if (sections.length === 0) return { header: { ...header }, lead: body };
      try {
        return { header: { ...header, ...formatter.parse(sections) }, lead };
      } catch {
        // Sections an author wrote that are not the fields are their text.
        return { header: { ...header }, lead: body };
      }
    },
    write(values, lead): { header: Record<string, unknown>; body: string } {
      const sections = formatter.format(
        Object.fromEntries(
          Object.entries(values).filter(
            ([key, value]) => moved.has(key) && value !== undefined,
          ),
        ),
      );
      const text = lead.replace(/\n+$/u, "");
      if (above)
        return {
          header: Object.fromEntries(
            Object.entries(values).filter(([key]) => !moved.has(key)),
          ),
          body:
            text.length === 0
              ? sections
              : sections.length === 0
                ? `${text}\n`
                : `${sections}\n${text}\n`,
        };
      return {
        header: Object.fromEntries(
          Object.entries(values).filter(([key]) => !moved.has(key)),
        ),
        body:
          text.length === 0
            ? sections
            : sections.length === 0
              ? `${text}\n`
              : `${text}\n\n${sections}`,
      };
    },
  };
}

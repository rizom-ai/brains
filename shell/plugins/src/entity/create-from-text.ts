import type {
  CreateInput,
  CreateInterceptionResult,
} from "@brains/entity-service";
import { getErrorMessage } from "@brains/utils/error";
import { generateMarkdown, parseMarkdown } from "@brains/utils/markdown";
import { z } from "@brains/utils/zod";

/** The writer's own text, titled, with the fields they stated for it. */
export interface EntityText<TFields> {
  title: string;
  /** The text as written, without frontmatter (and without a title heading the type does not show). */
  body: string;
  /** Fields stated in the text's frontmatter or by the caller; the caller's win. */
  fields: TFields;
}

export type EntityTextResult<TFields> =
  /** Not a save of the writer's own text, or a document the type stores as given. */
  | { kind: "not-text" }
  | { kind: "error"; error: string }
  | { kind: "text"; text: EntityText<TFields> };

export interface ReadEntityTextOptions<TSchema extends z.ZodObject> {
  /** What the writer calls the entity, for messages: "project", "deck". */
  noun: string;
  /** Fields a writer may state, in the text's frontmatter or as system_create `fields`. */
  fieldsSchema: TSchema;
  /** A document the type can store as given; the normal create stores it. */
  isComplete: (frontmatter: Record<string, unknown>, body: string) => boolean;
  /** Keep a leading heading that titles the text in the body, as a deck's title slide. */
  keepTitleHeading?: boolean;
}

/** A date the writer states, such as 2025-03-12, kept as an ISO timestamp. */
export const statedDateSchema: z.ZodPipe<
  z.ZodString,
  z.ZodTransform<string, string>
> = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Expected a date such as 2025-03-12",
  })
  .transform((value) => new Date(value).toISOString());

const LEADING_H1 =
  /^(?:[ \t]*\r?\n)*#[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*(?:\r?\n|$)/;

function sameTitle(a: string, b: string): boolean {
  const normalize = (value: string): string =>
    value.trim().replace(/\s+/g, " ").toLowerCase();
  return normalize(a) === normalize(b);
}

/**
 * Title the text from the stated title or its leading # heading. A heading
 * that is (or repeats) the title is dropped so the page does not show it
 * twice, unless the type keeps it; any other text stays exactly as written.
 */
function titleAndBody(
  stated: string | undefined,
  text: string,
  keepTitleHeading: boolean,
): { title: string | undefined; body: string } {
  const heading = LEADING_H1.exec(text);
  const headingText = heading?.[1]?.trim();
  if (!heading || !headingText) return { title: stated, body: text };
  if (stated && !sameTitle(stated, headingText)) {
    return { title: stated, body: text };
  }
  return {
    title: stated ?? headingText,
    body: keepTitleHeading
      ? text
      : text.slice(heading[0].length).replace(/^(?:[ \t]*\r?\n)+/, ""),
  };
}

function describeIssues(error: z.ZodError, noun: string): string {
  return error.issues
    .map((issue) =>
      issue.code === "unrecognized_keys"
        ? `not ${noun} fields: ${issue.keys.join(", ")}`
        : `${issue.path.join(".")}: ${issue.message}`,
    )
    .join("; ");
}

function statedTitle(
  input: CreateInput,
  frontmatter: Record<string, unknown>,
): string | undefined {
  const title = [input.title, frontmatter["title"]].find(
    (value): value is string => typeof value === "string" && !!value.trim(),
  );
  return title?.trim();
}

/**
 * Read a system_create of the writer's own text for a type that needs more
 * than text: the text is kept as written, titled from the caller or its
 * leading # heading, with the fields the writer stated. The type fills in
 * the rest. Prompts, URLs, uploads and complete documents are left to the
 * normal create.
 */
export function readEntityText<TSchema extends z.ZodObject>(
  input: CreateInput,
  options: ReadEntityTextOptions<TSchema>,
): EntityTextResult<z.output<TSchema>> {
  if (input.prompt || input.from || input.url || !input.content) {
    return { kind: "not-text" };
  }
  const { noun } = options;

  let parsed: { frontmatter: Record<string, unknown>; content: string };
  try {
    parsed = parseMarkdown(input.content);
  } catch (error) {
    return {
      kind: "error",
      error: getErrorMessage(error, `Unreadable ${noun} frontmatter`),
    };
  }
  if (options.isComplete(parsed.frontmatter, parsed.content)) {
    return { kind: "not-text" };
  }

  const fromText = options.fieldsSchema.safeParse(parsed.frontmatter);
  if (!fromText.success) {
    return {
      kind: "error",
      error: `Invalid ${noun} frontmatter (${describeIssues(fromText.error, noun)}).`,
    };
  }
  const stated = options.fieldsSchema.strict().safeParse(input.fields ?? {});
  if (!stated.success) {
    return {
      kind: "error",
      error: `Invalid ${noun} fields (${describeIssues(stated.error, noun)}).`,
    };
  }

  const { title, body } = titleAndBody(
    statedTitle(input, parsed.frontmatter),
    parsed.content,
    options.keepTitleHeading === true,
  );
  if (!title) {
    return {
      kind: "error",
      error: `What should this ${noun} be called? The text has no "# Title" heading. (Save it again from the same user message, with that \`title\`.)`,
    };
  }
  const withoutTitle = options.keepTitleHeading
    ? titleAndBody(undefined, body, false).body
    : body;
  if (!withoutTitle.trim()) {
    return {
      kind: "error",
      error: `The ${noun} has no text besides its title.`,
    };
  }

  return {
    kind: "text",
    text: {
      title,
      body,
      fields: { ...fromText.data, ...stated.data },
    },
  };
}

/**
 * Continue the create with the completed document: the type's frontmatter
 * over the text as written. Stated fields are already in the frontmatter.
 */
export function continueWithEntityText(
  input: CreateInput,
  document: {
    title: string;
    frontmatter: Record<string, unknown>;
    body: string;
  },
): CreateInterceptionResult {
  const { fields: _applied, ...rest } = input;
  return {
    kind: "continue",
    input: {
      ...rest,
      title: document.title,
      content: generateMarkdown(
        Object.fromEntries(
          Object.entries(document.frontmatter).filter(
            ([, value]) => value !== undefined,
          ),
        ),
        document.body,
      ),
    },
  };
}

/** A create of the writer's text that cannot go ahead, with what to do instead. */
export function entityTextError(error: string): CreateInterceptionResult {
  return { kind: "handled", result: { success: false, error } };
}

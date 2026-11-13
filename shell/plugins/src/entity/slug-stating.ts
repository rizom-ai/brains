import { slugify } from "@brains/utils/string-utils";
import { definedFields } from "@brains/utils/strip-undefined";

/** What a type that may state its slug keeps beside its own fields. */
export interface SlugStating {
  readonly title: string;
  readonly slug: string;
  /** Whether the file stated the slug, as opposed to it being resolved. */
  readonly authoredSlug?: boolean | undefined;
  /** What a failed generation recorded. */
  readonly error?: string | undefined;
}

/**
 * Metadata read from the frontmatter of a type that may state its slug: the
 * slug as stated, marked authored, or resolved from the title when the file
 * states none; and the error a failed generation recorded there.
 */
export function slugStatingMetadata<
  T extends { title: string; slug?: string | undefined },
>(
  parsed: T,
  frontmatter: Readonly<Record<string, unknown>>,
): Omit<T, "slug"> & { slug: string; authoredSlug?: true; error?: string } {
  const error = frontmatter["error"];
  return {
    ...parsed,
    slug: parsed.slug ?? slugify(parsed.title),
    ...(parsed.slug !== undefined && { authoredSlug: true as const }),
    ...(typeof error === "string" && { error }),
  };
}

/**
 * The frontmatter such a type writes, in the order its adapter wrote it: the
 * title, the slug under it when the file stated one, the type's own fields
 * in the order given, the slug after them when it was resolved from the
 * title, then the error a failed generation recorded. Undefined fields are
 * left out.
 */
export function slugStatingFrontmatter(
  metadata: SlugStating,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const authored = metadata.authoredSlug === true;
  return definedFields({
    title: metadata.title,
    ...(authored && { slug: metadata.slug }),
    ...fields,
    ...(!authored && { slug: metadata.slug }),
    error: metadata.error,
  });
}

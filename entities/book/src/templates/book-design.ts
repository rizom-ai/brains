import type { BookFields, BookSectionLink } from "../schemas/book-pages";

/** A book opens at /books/<book>; its sections at /books/<book>/<order>. */
export function bookHref(book: Pick<BookFields, "id">): string {
  return `/books/${book.id}`;
}

export function sectionHref(section: Pick<BookSectionLink, "slug">): string {
  return `/books/${section.slug}`;
}

const LICENSE_LABELS: Record<
  NonNullable<BookFields["frontmatter"]["license"]>,
  string
> = {
  "public-domain": "Public domain",
  "CC-BY-SA-4.0": "CC BY-SA 4.0",
  "CC-BY-NC-ND-4.0": "CC BY-NC-ND 4.0",
};

export function licenseLabel(
  entry: Pick<BookFields, "frontmatter">,
): string | null {
  const license = entry.frontmatter.license;
  return license ? LICENSE_LABELS[license] : null;
}

export const bookClasses = {
  page: "mx-auto w-full max-w-[68ch] px-4 py-16 md:py-24",
  label:
    "font-mono text-[0.625rem] uppercase tracking-[0.18em] text-theme-light",
  link: "text-inherit no-underline transition-colors duration-150 hover:text-brand",
  rule: "border-t border-rule-strong",
} as const;

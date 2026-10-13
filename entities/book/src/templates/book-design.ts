import type { BookWithData } from "../schemas/book";
import type { BookSectionWithData } from "../schemas/book-section";

/** A book opens at /books/<book>; its sections at /books/<book>/<order>. */
export function bookHref(target: BookWithData | BookSectionWithData): string {
  return target.entityType === "book"
    ? `/books/${target.id}`
    : `/books/${target.metadata.slug}`;
}

const LICENSE_LABELS: Record<
  NonNullable<BookWithData["frontmatter"]["license"]>,
  string
> = {
  "public-domain": "Public domain",
  "CC-BY-SA-4.0": "CC BY-SA 4.0",
  "CC-BY-NC-ND-4.0": "CC BY-NC-ND 4.0",
};

export function licenseLabel(entry: BookWithData): string | null {
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

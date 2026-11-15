/** A book opens at its slug; its sections follow at `<book>/<order>`. */
export function bookSectionSlug(book: string, order: number): string {
  return `${book}/${order}`;
}

/** What every slug of a book's sections starts with. */
export function bookSectionSlugPrefix(book: string): string {
  return `${book}/`;
}

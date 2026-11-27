/**
 * The browser tab's title: the page, where it lives, then the brain, so tabs
 * and history entries can be told apart. Missing parts and a part that
 * repeats the one before it are left out.
 */
export function studioDocumentTitle(
  parts: ReadonlyArray<string | null | undefined>,
  brand: string,
): string {
  return [...parts, brand]
    .map((part) => part?.trim() ?? "")
    .filter((part, index, all) => part !== "" && part !== all[index - 1])
    .join(" — ");
}

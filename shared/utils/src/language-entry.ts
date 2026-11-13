/** A language's entry in a record keyed by language tag, whatever its case. */
export function languageEntry<T>(
  entries: Record<string, T> | undefined,
  language: string,
): T | undefined {
  const tag = language.toLowerCase();
  return Object.entries(entries ?? {}).find(
    ([key]) => key.toLowerCase() === tag,
  )?.[1];
}

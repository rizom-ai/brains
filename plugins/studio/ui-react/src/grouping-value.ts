/** Presentation only: never use this label as a membership or URL value. */
export function groupingValueLabel(value: string): string {
  if (
    value !== "" &&
    value === value.trim() &&
    !/["\\\p{Cc}\p{Cf}]|[^\S ]| {2}/u.test(value)
  )
    return value;
  // Quoting plus explicit whitespace escapes distinguishes empty values,
  // invisible characters, and repeated spaces even in accessible names.
  return JSON.stringify(value).replace(
    /\s|\p{Cf}|\p{Cc}/gu,
    (character): string =>
      character
        .split("")
        .map(
          (unit): string =>
            `\\u${unit.charCodeAt(0).toString(16).padStart(4, "0")}`,
        )
        .join(""),
  );
}

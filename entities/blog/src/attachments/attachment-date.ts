import { formatDate } from "@rizom/brain-ui";

/** A post's date as an attachment prints it, or nothing for a date it lacks or cannot read. */
export function attachmentDate(
  value: string | null,
  style: "medium" | "long",
): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return formatDate(date, { style });
}

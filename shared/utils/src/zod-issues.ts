import type { z } from "./zod";

const SEPARATOR = ", ";
const ELLIPSIS = "…";

function formatIssue(issue: z.core.$ZodIssue): string {
  const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
  return `${path}: ${issue.message}`;
}

/**
 * A schema's refusal as its caller can act on it: each issue's path and
 * message, in order. The issues describe the caller's own input against the
 * schema it was given, so they are safe to hand back.
 *
 * With `maxLength`, the list is cut between whole issues and ends by saying
 * how many it left out; a single issue longer than the bound is shortened.
 */
export function formatZodIssues(
  error: z.ZodError,
  options: { readonly maxLength?: number | undefined } = {},
): string {
  const issues = error.issues.map(formatIssue);
  const full = issues.join(SEPARATOR);
  const { maxLength } = options;
  if (maxLength === undefined || full.length <= maxLength) return full;

  const omission = (dropped: number): string =>
    `${SEPARATOR}${ELLIPSIS} ${dropped} more`;
  // The longest run of leading issues that fits beside the note of what it
  // leaves out.
  const kept = issues.reduce<string[]>((fitting, issue, index) => {
    if (fitting.length < index) return fitting;
    const candidate = [...fitting, issue];
    const dropped = issues.length - candidate.length;
    const length =
      candidate.join(SEPARATOR).length +
      (dropped > 0 ? omission(dropped).length : 0);
    return length <= maxLength ? candidate : fitting;
  }, []);
  if (kept.length === 0) {
    return `${full.slice(0, Math.max(0, maxLength - ELLIPSIS.length))}${ELLIPSIS}`;
  }
  return `${kept.join(SEPARATOR)}${omission(issues.length - kept.length)}`;
}

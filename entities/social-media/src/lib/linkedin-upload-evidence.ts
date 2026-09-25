import {
  linkedInUploadRecoverySchema,
  parseLinkedInUploadEvidence,
  type LinkedInUploadEvidence,
} from "@brains/contracts";
import { PartialLinkedInUploadError } from "./linkedin-client";

/** Diagnostic projections only, not a journal, post receipt or retry authority. */
export function collectLinkedInUploadEvidence(
  error: unknown,
): LinkedInUploadEvidence | undefined {
  const evidence: LinkedInUploadEvidence = {
    uploads: [],
    nodes: [],
    truncated: false,
    invalid: false,
  };
  const pending: object[] = [];
  const seen = new WeakMap<object, number>();
  let marked = false;
  const enqueue = (value: unknown): number | undefined => {
    if (
      value === null ||
      (typeof value !== "object" && typeof value !== "function")
    )
      return;
    const existing = seen.get(value);
    if (existing !== undefined) return existing;
    if (pending.length >= 16) {
      evidence.truncated = true;
      return;
    }
    const index = pending.length;
    seen.set(value, index);
    pending.push(value);
    evidence.nodes.push({ kind: "opaque" });
    return index;
  };
  enqueue(error);
  for (let index = 0; index < pending.length; index++) {
    const current = pending[index];
    const node = evidence.nodes[index];
    if (!current || !node) continue;
    try {
      if (current instanceof Error) node.kind = "error";
      if (current instanceof PartialLinkedInUploadError) {
        marked = true;
        const parsed = linkedInUploadRecoverySchema.safeParse(current.recovery);
        if (!parsed.success) evidence.invalid = true;
        else if (evidence.uploads.length >= 8) evidence.truncated = true;
        else {
          node.upload = evidence.uploads.length;
          evidence.uploads.push(parsed.data);
        }
      }
    } catch {
      // Hostile evidence must not hide independent branches or escape reporting.
      evidence.invalid = true;
    }
    try {
      const cause = enqueue(Reflect.get(current, "cause"));
      if (cause !== undefined) node.cause = cause;
    } catch {
      evidence.invalid = true;
    }
    try {
      if (current instanceof AggregateError) {
        node.kind = "aggregate";
        const children: unknown = current.errors;
        if (!Array.isArray(children)) evidence.invalid = true;
        else {
          node.errors = [];
          if (children.length > 8) evidence.truncated = true;
          for (let child = 0; child < Math.min(children.length, 8); child++) {
            try {
              const edge = enqueue(children[child]);
              if (edge !== undefined) node.errors.push(edge);
            } catch {
              evidence.invalid = true;
            }
          }
        }
      }
    } catch {
      // Unsafe aggregate access is reported as incomplete evidence, never success;
      // its private diagnostics must not escape into this selected projection.
      evidence.invalid = true;
    }
  }
  if (!marked && !evidence.truncated && !evidence.invalid) return undefined;
  return parseLinkedInUploadEvidence(evidence);
}

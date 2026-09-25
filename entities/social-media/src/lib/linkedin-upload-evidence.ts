import { MAX_ASSET_BYTES } from "@brains/assets";
import { z } from "@brains/utils/zod";
import {
  PartialLinkedInUploadError,
  type LinkedInUploadRecovery,
} from "./linkedin-client";

const receiptSchema: z.ZodType<LinkedInUploadRecovery> = z.object({
  kind: z.enum(["image", "document"]),
  resourceUrn: z
    .string()
    .max(1024)
    .regex(/^urn:li:[A-Za-z0-9:._-]+$/)
    .refine((value) => value.trim() === value),
  sha256: z
    .string()
    .length(64)
    .regex(/^[a-f0-9]{64}$/),
  sizeBytes: z.number().int().positive().max(MAX_ASSET_BYTES),
  stage: z.enum([
    "registered",
    "upload-received",
    "uploaded",
    "post-attempted",
  ]),
});

interface EvidenceNode {
  kind: "error" | "aggregate" | "opaque";
  upload?: number | undefined;
  cause?: number | undefined;
  errors?: number[] | undefined;
}
const nodeSchema: z.ZodType<EvidenceNode> = z.strictObject({
  kind: z.enum(["error", "aggregate", "opaque"]),
  upload: z.number().int().min(0).max(7).optional(),
  cause: z.number().int().min(0).max(15).optional(),
  errors: z.array(z.number().int().min(0).max(15)).max(8).optional(),
});
// Eight ASCII-only projections and sixteen nodes fit within 16 KiB.
export interface LinkedInUploadEvidence {
  uploads: LinkedInUploadRecovery[];
  nodes: EvidenceNode[];
  truncated: boolean;
  invalid: boolean;
}
export const linkedInUploadEvidenceSchema: z.ZodType<LinkedInUploadEvidence> = z
  .strictObject({
    uploads: z.array(receiptSchema).max(8),
    nodes: z.array(nodeSchema).min(1).max(16),
    truncated: z.boolean(),
    invalid: z.boolean(),
  })
  .refine(
    (value) =>
      new TextEncoder().encode(JSON.stringify(value)).byteLength <= 16 * 1024,
    "LinkedIn evidence exceeds its metadata budget",
  )
  .refine(
    (value) =>
      value.nodes.every(
        (node) =>
          (node.upload === undefined || node.upload < value.uploads.length) &&
          (node.cause === undefined || node.cause < value.nodes.length) &&
          (node.errors ?? []).every((edge) => edge < value.nodes.length),
      ),
    "LinkedIn evidence contains a dangling reference",
  );

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
        const parsed = receiptSchema.safeParse(current.recovery);
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
  const result = linkedInUploadEvidenceSchema.parse(evidence);
  for (const upload of result.uploads) Object.freeze(upload);
  Object.freeze(result.uploads);
  for (const node of result.nodes) {
    if (node.errors) Object.freeze(node.errors);
    Object.freeze(node);
  }
  Object.freeze(result.nodes);
  return Object.freeze(result);
}

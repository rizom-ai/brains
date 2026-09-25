import { z } from "@brains/utils/zod";

export interface LinkedInUploadRecovery {
  kind: "image" | "document";
  resourceUrn: string;
  sha256: string;
  sizeBytes: number;
  stage: "registered" | "upload-received" | "uploaded" | "post-attempted";
}
export interface LinkedInPostReceipt {
  id: string;
}
export const linkedInPostReceiptSchema: z.ZodType<LinkedInPostReceipt> =
  z.object({
    id: z
      .string()
      .max(256)
      .regex(/^(?:urn:li:(?:share|ugcPost):[A-Za-z0-9_-]+)?$/)
      .refine((value) => value.trim() === value),
  });
export interface PublishRecoveryNode {
  kind: "error" | "aggregate" | "opaque";
  upload?: number | undefined;
  post?: LinkedInPostReceipt | undefined;
  cause?: number | undefined;
  errors?: number[] | undefined;
}
export interface LinkedInUploadEvidence {
  uploads: LinkedInUploadRecovery[];
  nodes: PublishRecoveryNode[];
  truncated: boolean;
  invalid: boolean;
}

export const linkedInUploadRecoverySchema: z.ZodType<LinkedInUploadRecovery> =
  z.object({
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
    // Diagnostic wire ceiling only; actor admission remains authoritative.
    // Keep this browser-safe contract independent of Node-only asset helpers.
    sizeBytes: z
      .number()
      .int()
      .positive()
      .max(100 * 1024 * 1024),
    stage: z.enum([
      "registered",
      "upload-received",
      "uploaded",
      "post-attempted",
    ]),
  });
const nodeSchema: z.ZodType<PublishRecoveryNode> = z.strictObject({
  kind: z.enum(["error", "aggregate", "opaque"]),
  upload: z.number().int().min(0).max(7).optional(),
  post: linkedInPostReceiptSchema.optional(),
  cause: z.number().int().min(0).max(15).optional(),
  errors: z.array(z.number().int().min(0).max(15)).max(8).optional(),
});
export const linkedInUploadEvidenceSchema: z.ZodType<LinkedInUploadEvidence> = z
  .strictObject({
    uploads: z.array(linkedInUploadRecoverySchema).max(8),
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

/** Validate and detach diagnostics before passing them to independent observers. */
export function parseLinkedInUploadEvidence(
  value: unknown,
): LinkedInUploadEvidence {
  const result = linkedInUploadEvidenceSchema.parse(value);
  for (const upload of result.uploads) Object.freeze(upload);
  Object.freeze(result.uploads);
  for (const node of result.nodes) {
    if (node.post) Object.freeze(node.post);
    if (node.errors) Object.freeze(node.errors);
    Object.freeze(node);
  }
  Object.freeze(result.nodes);
  return Object.freeze(result);
}

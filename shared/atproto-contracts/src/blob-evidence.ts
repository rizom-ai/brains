import { z } from "@brains/utils/zod";
import type { AtprotoBlobRef } from "./records";

const MAX_NODES = 16;
const MAX_RECEIPTS = 16;
const MAX_BYTES = 40 * 1024;
const encoder = new TextEncoder();
function jsonByteLength(value: unknown): number {
  return encoder.encode(JSON.stringify(value)).byteLength;
}
type Stage = "blob-receipt" | "cover" | "body-images";
interface Receipt {
  blob: AtprotoBlobRef;
  imageId?: string | undefined;
  sha256?: string | undefined;
}
interface EvidenceNode {
  kind: "error" | "aggregate" | "opaque";
  stage?: Stage | undefined;
  status?: "received" | "acknowledged" | undefined;
  receipts?: Receipt[] | undefined;
  cause?: number | undefined;
  errors?: number[] | undefined;
}
export interface AtprotoBlobEvidence {
  nodes: EvidenceNode[];
  truncated: boolean;
  invalid: boolean;
}
const stageSchema: z.ZodType<Stage> = z.enum([
  "blob-receipt",
  "cover",
  "body-images",
]);
const receiptSchema: z.ZodType<Receipt> = z.object({
  blob: z.object({
    $type: z.literal("blob").optional(),
    ref: z.object({ $link: z.string().min(1).max(1024) }),
    mimeType: z.string().min(1).max(128),
    size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  }),
  imageId: z.string().min(1).max(256).optional(),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});
const nodeSchema: z.ZodType<EvidenceNode> = z.strictObject({
  kind: z.enum(["error", "aggregate", "opaque"]),
  stage: stageSchema.optional(),
  status: z.enum(["received", "acknowledged"]).optional(),
  receipts: z.array(receiptSchema).max(MAX_RECEIPTS).optional(),
  cause: z
    .number()
    .int()
    .nonnegative()
    .max(MAX_NODES - 1)
    .optional(),
  errors: z
    .array(
      z
        .number()
        .int()
        .nonnegative()
        .max(MAX_NODES - 1),
    )
    .max(MAX_NODES)
    .optional(),
});
export const atprotoBlobEvidenceSchema: z.ZodType<AtprotoBlobEvidence> = z
  .strictObject({
    nodes: z.array(nodeSchema).min(1).max(MAX_NODES),
    truncated: z.boolean(),
    invalid: z.boolean(),
  })
  .refine(
    (value) => jsonByteLength(value) <= MAX_BYTES,
    "AT Protocol evidence exceeds its metadata budget",
  )
  .refine(
    (value) =>
      value.nodes.every(
        (node) =>
          (node.cause === undefined || node.cause < value.nodes.length) &&
          (node.errors ?? []).every((index) => index < value.nodes.length),
      ),
    "AT Protocol evidence has a dangling edge",
  );
function readReceipt(input: unknown): Receipt | undefined {
  try {
    const result = receiptSchema.safeParse(input);
    return result.success ? result.data : undefined;
  } catch {
    // Custom accessors must not replace the upload outcome being reported.
    return undefined;
  }
}
interface ReceiptInput {
  blob: AtprotoBlobRef;
  imageId?: string;
  sha256?: string;
}

/** Shared marker for explicit blob outcomes, not arbitrary provider errors.
 * Snapshot only selected bounded metadata. Invalid evidence never replaces the
 * original exception, and URLs, credentials, paths and raw responses are omitted. */
export class AtprotoBlobEvidenceError extends Error {
  public readonly evidence: {
    stage: Stage;
    receipts: Receipt[];
    truncated: boolean;
    invalid: boolean;
  };
  constructor(
    message: string,
    stage: Stage,
    receipts: readonly ReceiptInput[],
    options?: ErrorOptions,
  ) {
    super(message, options);
    const snapshot: Receipt[] = [];
    let bytes = 0;
    let invalid = false;
    let truncated = receipts.length > MAX_RECEIPTS;
    for (const receipt of receipts.slice(0, MAX_RECEIPTS)) {
      const parsed = readReceipt(receipt);
      if (!parsed) {
        invalid = true;
        continue;
      }
      const size = jsonByteLength(parsed);
      if (bytes + size > MAX_BYTES / 2) {
        truncated = true;
        break;
      }
      bytes += size;
      snapshot.push(parsed);
    }
    this.evidence = { stage, receipts: snapshot, truncated, invalid };
  }
}

/** Bounded graph preserves separate cause/aggregate edges and shared/cyclic
 * identities without serializing raw diagnostics. This is evidence, not retry
 * authority or durable delivery acknowledgement. */
export function collectAtprotoBlobEvidence(
  error: unknown,
): AtprotoBlobEvidence | undefined {
  const queue: unknown[] = [];
  const seen = new WeakMap<object, number>();
  const nodes: AtprotoBlobEvidence["nodes"] = [];
  let truncated = false;
  let invalid = false;
  let found = false;
  let receiptCount = 0;
  let receiptBytes = 0;
  const add = (value: unknown): number | undefined => {
    const identity =
      (typeof value === "object" && value !== null) ||
      typeof value === "function"
        ? value
        : undefined;
    const previous = identity ? seen.get(identity) : undefined;
    if (previous !== undefined) return previous;
    if (queue.length === MAX_NODES) {
      truncated = true;
      return undefined;
    }
    const index = queue.length;
    queue.push(value);
    if (identity) seen.set(identity, index);
    return index;
  };
  add(error);
  for (let index = 0; index < queue.length; index++) {
    const value = queue[index];
    const node: AtprotoBlobEvidence["nodes"][number] = {
      kind:
        value instanceof AggregateError
          ? "aggregate"
          : value instanceof Error
            ? "error"
            : "opaque",
    };
    nodes.push(node);
    if (!(value instanceof Error)) continue;
    try {
      if (value instanceof AtprotoBlobEvidenceError) {
        found = true;
        const evidence = value.evidence;
        node.stage = stageSchema.parse(evidence.stage);
        node.status =
          evidence.stage === "blob-receipt" ? "received" : "acknowledged";
        node.receipts = [];
        if (
          typeof evidence.truncated !== "boolean" ||
          typeof evidence.invalid !== "boolean"
        )
          invalid = true;
        truncated ||= evidence.truncated === true;
        invalid ||= evidence.invalid === true;
        if (evidence.receipts.length > MAX_RECEIPTS) truncated = true;
        for (const entry of evidence.receipts.slice(0, MAX_RECEIPTS)) {
          const receipt = readReceipt(entry);
          if (!receipt) {
            invalid = true;
            continue;
          }
          const size = jsonByteLength(receipt);
          if (
            receiptCount === MAX_RECEIPTS ||
            receiptBytes + size > MAX_BYTES - 8192
          ) {
            truncated = true;
            break;
          }
          receiptBytes += size;
          receiptCount++;
          node.receipts.push(receipt);
        }
      }
    } catch {
      // Malformed evidence does not suppress independent cause branches.
      invalid = true;
    }
    try {
      const cause = value.cause;
      if (cause !== undefined) {
        const index = add(cause);
        if (index !== undefined) node.cause = index;
      }
    } catch {
      // Hostile cause accessors are opaque, not authority to inspect other data.
      invalid = true;
    }
    try {
      if (value instanceof AggregateError) {
        node.errors = [];
        if (value.errors.length > MAX_NODES) truncated = true;
        for (let i = 0; i < Math.min(value.errors.length, MAX_NODES); i++) {
          const child = add(value.errors[i]);
          if (child !== undefined) node.errors.push(child);
        }
      }
    } catch {
      // A malformed/custom error must not prevent reporting known receipts.
      invalid = true;
    }
  }
  if (!found && !truncated && !invalid) return undefined;
  return atprotoBlobEvidenceSchema.parse({ nodes, truncated, invalid });
}

import {
  linkedInPostReceiptSchema,
  type LinkedInPostReceipt,
} from "@brains/contracts";

/** A post response was acknowledged; later diagnostics failed. Never resend it. */
export class AcknowledgedLinkedInPostError extends Error {
  public readonly receipt: Readonly<LinkedInPostReceipt> | undefined;
  constructor(id: string, cause: unknown) {
    super("LinkedIn post acknowledged but diagnostics failed", { cause });
    this.name = "AcknowledgedLinkedInPostError";
    const parsed = linkedInPostReceiptSchema.safeParse({ id });
    // Invalid provider identifiers are not safe diagnostic evidence. Preserve
    // the acknowledgement marker and original cause without copying that value.
    this.receipt = parsed.success ? Object.freeze(parsed.data) : undefined;
  }
}

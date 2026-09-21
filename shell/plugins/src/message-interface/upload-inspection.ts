import { MAX_ASSET_BYTES } from "@brains/assets";
import { z } from "@brains/utils/zod";
import {
  detectMessageUploadSignature,
  messageTextUploadMaxBytes,
} from "./upload-policy";

export interface UploadInspectionDetails {
  binaryMediaType?: string | undefined;
  /** Valid UTF-8 without NUL, within the existing text-upload size ceiling. */
  validText: boolean;
}
export const uploadInspectionDetailsSchema: z.ZodType<UploadInspectionDetails> =
  z.strictObject({
    binaryMediaType: z
      .enum([
        "image/png",
        "image/jpeg",
        "image/gif",
        "image/webp",
        "application/pdf",
      ])
      .optional(),
    validText: z.boolean(),
  });

/** Actor-only inspection. Retains twelve signature bytes, not borrowed credits
 * or whole payloads. UTF-8 decoding is incremental and only attempted within
 * the existing 100,000-byte text policy. This is signature policy, not a full
 * image/PDF decoder or a claim about transport/native peak memory. */
export class UploadInspection {
  private readonly sizeBytes: number;
  private readonly prefix = new Uint8Array(12);
  private prefixSize = 0;
  private received = 0;
  private closed = false;
  private validText: boolean;
  private readonly decoder = new TextDecoder("utf-8", { fatal: true });
  constructor(sizeBytes: number) {
    this.sizeBytes = z
      .number()
      .int()
      .nonnegative()
      .max(MAX_ASSET_BYTES)
      .parse(sizeBytes);
    this.validText = sizeBytes <= messageTextUploadMaxBytes;
  }
  public observe(credit: Uint8Array): void {
    if (this.closed) throw new Error("Upload inspection is closed");
    if (
      credit.byteLength > 32 * 1024 ||
      credit.byteLength > this.sizeBytes - this.received
    ) {
      this.closed = true;
      throw new Error("Upload inspection credit/size mismatch");
    }
    const prefix = credit.subarray(0, this.prefix.length - this.prefixSize);
    this.prefix.set(prefix, this.prefixSize);
    this.prefixSize += prefix.byteLength;
    this.received += credit.byteLength;
    if (this.validText) {
      if (credit.includes(0)) this.validText = false;
      else {
        try {
          this.decoder.decode(credit, { stream: true });
        } catch {
          this.validText = false;
        } // Invalid UTF-8 is a policy result, not an ignored transport error.
      }
    }
  }
  public finish(): UploadInspectionDetails {
    if (this.closed) throw new Error("Upload inspection is closed");
    this.closed = true;
    if (this.received !== this.sizeBytes)
      throw new Error("Upload inspection size mismatch");
    if (this.validText) {
      try {
        this.decoder.decode();
      } catch {
        this.validText = false;
      } // Reject a truncated final UTF-8 sequence.
    }
    const binaryMediaType = detectMessageUploadSignature(
      this.prefix.subarray(0, this.prefixSize),
    );
    return uploadInspectionDetailsSchema.parse({
      validText: this.validText,
      ...(binaryMediaType && { binaryMediaType }),
    });
  }
}

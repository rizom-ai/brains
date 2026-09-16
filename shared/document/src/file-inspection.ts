import { binaryUploadSizeSchema } from "@brains/db/binary-publication";
import { z } from "@brains/utils/zod";
import { countPdfPages } from "./lib/document-utils";

export const pdfInspectionDetailsSchema: z.ZodObject<{
  mimeType: z.ZodLiteral<"application/pdf">;
  pageCount: z.ZodNumber;
}> = z.strictObject({
  mimeType: z.literal("application/pdf"),
  pageCount: z.number().int().min(0),
});
export type PdfInspectionDetails = z.output<typeof pdfInspectionDetailsSchema>;

/** Actor-only inspection after native upload admission. Copies borrowed credits,
 * never retaining their backing. Preserves the existing page-count heuristic:
 * zero means unknown, not an empty PDF or proof of structural validity.
 * The 100 MiB input cap does not bound parser/string/GC/native peak memory.
 */
export class PdfFileInspection {
  private bytes: Buffer | undefined;
  private received = 0;
  constructor(sizeBytes: number) {
    this.bytes = Buffer.alloc(binaryUploadSizeSchema.parse(sizeBytes));
  }
  public observe(credit: Uint8Array): void {
    const bytes = this.bytes;
    if (!bytes) throw new Error("PDF inspection is closed");
    if (this.received + credit.byteLength > bytes.byteLength) {
      this.bytes = undefined;
      throw new Error("PDF inspection size mismatch");
    }
    bytes.set(credit, this.received);
    this.received += credit.byteLength;
  }
  public finish(): PdfInspectionDetails {
    const bytes = this.bytes;
    if (!bytes) throw new Error("PDF inspection is closed");
    this.bytes = undefined;
    if (this.received !== bytes.byteLength)
      throw new Error("PDF inspection size mismatch");
    if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-")))
      throw new Error("File has no PDF signature");
    return pdfInspectionDetailsSchema.parse({
      mimeType: "application/pdf",
      pageCount: countPdfPages(bytes),
    });
  }
}

import { expect, test } from "bun:test";
import { PdfFileInspection } from "../src/file-inspection";

test("PDF inspection copies borrowed credits and returns metadata only", () => {
  const bytes = Buffer.from("%PDF-1.7\n/Type /Pages /Count 3\n/Type /Page\n");
  const inspection = new PdfFileInspection(bytes.length);
  for (let offset = 0; offset < bytes.length; offset += 7) {
    const credit = Buffer.from(bytes.subarray(offset, offset + 7));
    inspection.observe(credit);
    credit.fill(0);
  }
  expect(inspection.finish()).toEqual({
    mimeType: "application/pdf",
    pageCount: 3,
  });
});
test("PDF inspection retains existing leaf-count and unknown-page semantics", () => {
  for (const [text, pages] of [
    ["%PDF-1.7\n/Type /Page /Type /Page\n", 2],
    ["%PDF-1.7\nopaque", 0],
  ] as const) {
    const bytes = Buffer.from(text);
    const inspection = new PdfFileInspection(bytes.length);
    inspection.observe(bytes);
    expect(inspection.finish().pageCount).toBe(pages);
  }
});
test("PDF inspection rejects size and signature mismatches and repeated completion", () => {
  expect(() => new PdfFileInspection(100 * 1024 * 1024 + 1)).toThrow();
  expect(() => new PdfFileInspection(-1)).toThrow();
  const short = new PdfFileInspection(8);
  short.observe(Buffer.from("%PDF-"));
  expect(() => short.finish()).toThrow(/size mismatch/);
  const overflow = new PdfFileInspection(1);
  expect(() => overflow.observe(Buffer.from("xx"))).toThrow(/size mismatch/);
  const wrong = new PdfFileInspection(5);
  wrong.observe(Buffer.from([0xa5, 0xd0, 0xc4, 0xc6, 0xad]));
  expect(() => wrong.finish()).toThrow(/PDF signature/);
  const complete = new PdfFileInspection(5);
  complete.observe(Buffer.from("%PDF-"));
  complete.finish();
  expect(() => complete.finish()).toThrow(/closed/);
  expect(() => complete.observe(Buffer.alloc(0))).toThrow(/closed/);
});

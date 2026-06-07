import { describe, expect, it } from "bun:test";
import { extractPdfMarkdown } from "../src/lib/pdf-markdown";

const primerPdfBase64 =
  "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA0NCA+PgpzdHJlYW0KQlQgL0YxIDI0IFRmIDcyIDcyMCBUZCAoRGlzdHJpYnV0ZWQgU3lzdGVtcyBQcmltZXIpIFRqIEVUCmVuZHN0cmVhbQplbmRvYmoKNSAwIG9iago8PCAvVHlwZSAvRm9udCAvU3VidHlwZSAvVHlwZTEgL0Jhc2VGb250IC9IZWx2ZXRpY2EgPj4KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMTUgMDAwMDAgbiAKMDAwMDAwMDI0MSAwMDAwMCBuIAowMDAwMDAwMzQ4IDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNiAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKNDE4CiUlRU9GCg==";

async function expectRejectsWith(
  promise: Promise<unknown>,
  expectedMessage: string,
): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect(error instanceof Error ? error.message : "").toContain(
      expectedMessage,
    );
    return;
  }
  throw new Error("Expected promise to reject");
}

describe("extractPdfMarkdown", () => {
  const primerPdf = Buffer.from(primerPdfBase64, "base64");

  it("extracts deterministic text from a PDF", async () => {
    const markdown = await extractPdfMarkdown(primerPdf);

    expect(markdown).toContain("Distributed Systems Primer");
  });

  it("rejects PDFs over the synchronous extraction byte limit", async () => {
    await expectRejectsWith(
      extractPdfMarkdown(primerPdf, { maxBytes: primerPdf.byteLength - 1 }),
      "Uploaded PDF is too large",
    );
  });

  it("rejects PDFs over the synchronous extraction page limit", async () => {
    await expectRejectsWith(
      extractPdfMarkdown(primerPdf, { maxPages: 0 }),
      "maximum supported for synchronous markdown extraction is 0",
    );
  });
});

import { describe, expect, it } from "bun:test";
import { deflateSync } from "node:zlib";
import { extractPdfMarkdown } from "../src/lib/pdf-markdown";
import { getErrorMessage } from "@brains/utils/error";

async function expectRejected(
  promise: Promise<unknown>,
  message: string,
): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect(getErrorMessage(error, "")).toContain(message);
    return;
  }
  throw new Error("Expected PDF extraction to reject");
}

// Build actual byte offsets and stream lengths; no parser recovery is needed
// for the positive fixtures. All text streams use a local, unembedded font.
function pdf(objects: readonly string[]): Buffer {
  let source = "%PDF-1.7\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(source, "latin1"));
    source += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(source, "latin1");
  source += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    source += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  source += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(source, "latin1");
}

function stream(text: string, compressed = false): string {
  const bytes = Buffer.from(text, "latin1");
  const content = compressed ? deflateSync(bytes) : bytes;
  return `<< /Length ${content.byteLength}${compressed ? " /Filter /FlateDecode" : ""} >>\nstream\n${content.toString("latin1")}\nendstream`;
}

function pages(texts: readonly string[], compressed = false): Buffer {
  return pdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Count ${texts.length} /Kids [${texts.map((_, index) => `${4 + index * 2} 0 R`).join(" ")}] >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    ...texts.flatMap((text, index) => [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + index * 2} 0 R >>`,
      stream(`BT /F1 12 Tf 72 720 Td (${text}) Tj ET`, compressed),
    ]),
  ]);
}

function sparseUnicodePdf(code: string): Buffer {
  const cmap = (mapping: string, type: 1 | 2 = 2): string =>
    stream(
      `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Fixture) /Ordering (Identity) /Supplement 0 >> def\n/CMapName /Fixture def\n/CMapType ${type} def\n1 begincodespacerange\n<00000000> <FFFFFFFF>\nendcodespacerange\n${mapping}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`,
    );
  return pdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    stream(`BT /F1 12 Tf 72 720 Td <${code}> Tj ET`),
    "<< /Type /Font /Subtype /Type0 /BaseFont /Helvetica /Encoding 6 0 R /DescendantFonts [7 0 R] /ToUnicode 8 0 R >>",
    cmap(`1 begincidchar\n<${code}> 1\nendcidchar`, 1),
    "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Helvetica /FontDescriptor 9 0 R /CIDSystemInfo << /Registry (Fixture) /Ordering (Identity) /Supplement 0 >> /DW 600 /CIDToGIDMap /Identity >>",
    cmap(`1 beginbfchar\n<${code}> <D83DDE00>\nendbfchar`),
    "<< /Type /FontDescriptor /FontName /Helvetica /Flags 32 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 800 /Descent -200 /CapHeight 700 /StemV 80 >>",
  ]);
}

describe("PDF parser consumer boundaries", () => {
  it("keeps page order, omits blank pages and flattens whitespace", async () => {
    expect(
      await extractPdfMarkdown(
        pages(["First   paragraph", "", "Last paragraph"]),
      ),
    ).toBe("First paragraph\n\nLast paragraph");
  });

  it("extracts Flate-compressed text and WinAnsi characters", async () => {
    expect(await extractPdfMarkdown(pages(["caf\xe9", "second"], true))).toBe(
      "café\n\nsecond",
    );
  });

  for (const code of ["00000001", "FFFFFFFF"]) {
    it(`decodes a sparse four-byte Unicode mapping at ${code}`, async () => {
      expect(await extractPdfMarkdown(sparseUnicodePdf(code))).toBe("😀");
    });
  }

  it("accepts the exact byte limit without detaching or altering caller bytes", async () => {
    const content = pages(["Repeatable"]);
    const original = Buffer.from(content);
    expect(
      await extractPdfMarkdown(content, { maxBytes: content.byteLength }),
    ).toBe("Repeatable");
    expect(content).toEqual(original);
    expect(await extractPdfMarkdown(content)).toBe("Repeatable");
    expect(content).toEqual(original);
  });

  it("rejects one byte over the caller limit", async () => {
    const content = pages(["Too large"]);
    await expectRejected(
      extractPdfMarkdown(content, { maxBytes: content.byteLength - 1 }),
      "Uploaded PDF is too large",
    );
  });

  it("retains the default input byte ceiling", async () => {
    await expectRejected(
      extractPdfMarkdown(Buffer.alloc(5_000_001)),
      "max 5000000 bytes",
    );
  });

  it("accepts exactly fifty pages", async () => {
    const text = Array.from({ length: 50 }, (_, index) => `Page ${index + 1}`);
    expect(await extractPdfMarkdown(pages(text))).toBe(text.join("\n\n"));
  });

  it("rejects fifty-one pages rather than returning partial text", async () => {
    await expectRejected(
      extractPdfMarkdown(pages(Array.from({ length: 51 }, () => "Text"))),
      "Uploaded PDF has 51 pages; maximum supported for synchronous markdown extraction is 50",
    );
  });

  it("retains caller page limits and permits a subsequent extraction after refusal", async () => {
    await expectRejected(
      extractPdfMarkdown(pages(["First", "Second"]), { maxPages: 1 }),
      "maximum supported for synchronous markdown extraction is 1",
    );
    expect(await extractPdfMarkdown(pages(["Next"]))).toBe("Next");
  });

  it("rejects a valid document with no extractable text", async () => {
    await expectRejected(
      extractPdfMarkdown(pages(["", ""])),
      "Could not extract text from the uploaded PDF",
    );
    expect(await extractPdfMarkdown(pages(["Next"]))).toBe("Next");
  });

  it("rejects malformed input rather than treating it as text", async () => {
    await expectRejected(
      extractPdfMarkdown(Buffer.from("not a PDF")),
      "Invalid PDF structure",
    );
    expect(await extractPdfMarkdown(pages(["Next"]))).toBe("Next");
  });
});

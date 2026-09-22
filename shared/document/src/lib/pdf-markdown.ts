// Extracts the PDF's text content as flat paragraphs (one block per page),
// not structured markdown — there is no heading/list/table detection. The
// caller wraps the result in title frontmatter, hence "markdown".
export const defaultPdfMarkdownMaxBytes = 5_000_000;
export const defaultPdfMarkdownMaxPages = 50;

export interface ExtractPdfMarkdownOptions {
  /** Maximum PDF input size for synchronous extraction. */
  maxBytes?: number | undefined;
  /** Maximum page count for synchronous extraction. */
  maxPages?: number | undefined;
  signal?: AbortSignal | undefined;
}

export async function extractPdfMarkdown(
  content: Buffer,
  options: ExtractPdfMarkdownOptions = {},
): Promise<string> {
  options.signal?.throwIfAborted();
  const maxBytes = options.maxBytes ?? defaultPdfMarkdownMaxBytes;
  if (content.byteLength > maxBytes) {
    throw new Error(
      `Uploaded PDF is too large for synchronous markdown extraction (${content.byteLength} bytes; max ${maxBytes} bytes)`,
    );
  }

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(content),
    disableFontFace: false,
    useSystemFonts: true,
    useWorkerFetch: false,
  });
  const errors: unknown[] = [];
  let markdown: string | undefined;
  try {
    const document = await loadingTask.promise;
    options.signal?.throwIfAborted();
    const maxPages = options.maxPages ?? defaultPdfMarkdownMaxPages;
    if (document.numPages > maxPages) {
      throw new Error(
        `Uploaded PDF has ${document.numPages} pages; maximum supported for synchronous markdown extraction is ${maxPages}`,
      );
    }

    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      options.signal?.throwIfAborted();
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const text = textContent.items
        .flatMap((item) => ("str" in item ? [item.str] : []))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (text.length > 0) pages.push(text);
    }

    markdown = pages.join("\n\n").trim();
    if (!markdown) {
      throw new Error("Could not extract text from the uploaded PDF");
    }
    options.signal?.throwIfAborted();
  } catch (error) {
    errors.push(error);
  } finally {
    try {
      await loadingTask.destroy();
    } catch (error) {
      if (!errors.includes(error)) errors.push(error);
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1)
    throw new AggregateError(
      errors,
      "PDF extraction and parser retirement failed",
      { cause: errors[0] },
    );
  if (markdown === undefined) throw new Error("PDF extraction has no result");
  return markdown;
}

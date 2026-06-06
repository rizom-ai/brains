export async function extractPdfMarkdown(content: Buffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({
    data: new Uint8Array(content),
    disableFontFace: false,
    useSystemFonts: true,
    useWorkerFetch: false,
  }).promise;

  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const text = textContent.items
      .flatMap((item) => ("str" in item ? [item.str] : []))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length > 0) pages.push(text);
  }

  const markdown = pages.join("\n\n").trim();
  if (!markdown) {
    throw new Error("Could not extract text from the uploaded PDF");
  }
  return markdown;
}

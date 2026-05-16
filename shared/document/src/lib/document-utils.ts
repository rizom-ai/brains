import type { DocumentMimeType } from "../schemas/document";

export interface ParsedDocumentDataUrl {
  mimeType: DocumentMimeType;
  base64: string;
}

export function parseDocumentDataUrl(dataUrl: string): ParsedDocumentDataUrl {
  const match = dataUrl.match(/^data:(application\/pdf);base64,(.+)$/i);
  if (!match?.[1] || !match[2]) {
    throw new Error("Invalid PDF document data URL");
  }
  return {
    mimeType: "application/pdf",
    base64: match[2],
  };
}

export function createPdfDataUrl(data: Buffer | Uint8Array): string {
  return `data:application/pdf;base64,${Buffer.from(data).toString("base64")}`;
}

export function isPdfDataUrl(value: string): boolean {
  return /^data:application\/pdf;base64,.+$/i.test(value);
}

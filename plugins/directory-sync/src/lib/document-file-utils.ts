import { extname } from "path";

export const DOCUMENT_EXTENSIONS = [".pdf"];

export function isDocumentFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return DOCUMENT_EXTENSIONS.includes(ext);
}

export function getDocumentMimeTypeForExtension(ext: string): string {
  const normalized = ext.toLowerCase().replace(".", "");
  switch (normalized) {
    case "pdf":
    default:
      return "application/pdf";
  }
}

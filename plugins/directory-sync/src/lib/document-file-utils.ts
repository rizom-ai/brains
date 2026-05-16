import { extname } from "path";

export const DOCUMENT_EXTENSIONS = [".pdf"];
export const DOCUMENT_SIDECAR_SUFFIX = ".meta.json";

export function isDocumentFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return DOCUMENT_EXTENSIONS.includes(ext);
}

/**
 * Document metadata that does not survive in PDF bytes (filename, dedupKey,
 * source provenance) is persisted in a sidecar JSON file alongside the PDF.
 */
export function isDocumentSidecarFile(filePath: string): boolean {
  return filePath.toLowerCase().endsWith(DOCUMENT_SIDECAR_SUFFIX);
}

export function getDocumentSidecarPath(pdfPath: string): string {
  return `${pdfPath}${DOCUMENT_SIDECAR_SUFFIX}`;
}

export function getDocumentMimeTypeForExtension(ext: string): string {
  const normalized = ext.toLowerCase().replace(".", "");
  switch (normalized) {
    case "pdf":
    default:
      return "application/pdf";
  }
}

/** The extensions an image entity's bytes are stored under. */
export const IMAGE_EXTENSIONS: readonly string[] = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".svg",
];

/** The extensions a document entity's bytes are stored under. */
export const DOCUMENT_EXTENSIONS: readonly string[] = [".pdf"];

/** The file extension for an image format name: `jpeg` → `.jpg`. */
export function getExtensionForFormat(format: string): string {
  switch (format.toLowerCase()) {
    case "jpeg":
      return ".jpg";
    case "svg+xml":
      return ".svg";
    default:
      return `.${format.toLowerCase()}`;
  }
}

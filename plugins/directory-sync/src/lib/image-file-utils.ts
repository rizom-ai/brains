import { extname } from "path";

export const IMAGE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".svg",
];

export function isImageFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}

export function getMimeTypeForExtension(ext: string): string {
  const normalized = ext.toLowerCase().replace(".", "");
  switch (normalized) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    default:
      return "image/png";
  }
}

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

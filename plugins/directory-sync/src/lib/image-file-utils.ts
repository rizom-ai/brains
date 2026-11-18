import { IMAGE_EXTENSIONS } from "@brains/entity-placement";
import { extname } from "path";

export { IMAGE_EXTENSIONS };

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

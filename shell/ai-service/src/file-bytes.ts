import type { FilePart } from "ai";

/**
 * A file part's bytes: from base64 text, raw bytes, or the data or text the
 * part holds. Undefined when the part only points at a file, by URL or by a
 * provider's reference.
 */
export function fileBytes(data: FilePart["data"]): Buffer | undefined {
  if (typeof data === "string") return Buffer.from(data, "base64");
  if (data instanceof URL) return undefined;
  if (data instanceof Uint8Array) return Buffer.from(data);
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data));
  if (!("type" in data)) return undefined;
  if (data.type === "data") return fileBytes(data.data);
  if (data.type === "text") return Buffer.from(data.text, "utf8");
  return undefined;
}

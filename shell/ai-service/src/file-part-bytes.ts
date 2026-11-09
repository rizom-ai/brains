import type { FilePart } from "ai";

/** A file part's bytes, or undefined when it only points at a URL. */
export function fileBytes(data: FilePart["data"]): Buffer | undefined {
  if (typeof data === "string") return Buffer.from(data, "base64");
  if (data instanceof URL) return undefined;
  return Buffer.from(data instanceof ArrayBuffer ? new Uint8Array(data) : data);
}

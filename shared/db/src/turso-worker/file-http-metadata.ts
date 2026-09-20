import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { z } from "@brains/utils/zod";

export interface FileHttpMultipart {
  fieldName: string;
  filename: string;
  mimeType: string;
  fields: Record<string, string>;
}
export type FileHttpMetadata = Record<string, string | number | boolean>;
export type FileHttpMetadataSelection = Record<string, (string | number)[]>;

const fieldNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_[\]-]+$/);
export const fileHttpMultipartSchema: z.ZodType<FileHttpMultipart> = z
  .strictObject({
    fieldName: fieldNameSchema,
    filename: z
      .string()
      .min(1)
      .max(255)
      .refine((value) =>
        [...value].every(
          (character) =>
            character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
        ),
      ),
    mimeType: z
      .string()
      .max(128)
      .regex(/^[A-Za-z0-9.+-]+\/[A-Za-z0-9.+-]+$/),
    fields: z.record(fieldNameSchema, z.string().max(16_384)),
  })
  .refine((input) => {
    const entries = Object.entries(input.fields);
    return (
      entries.length <= 8 &&
      !Object.hasOwn(input.fields, input.fieldName) &&
      entries.reduce(
        (sum, [key, value]) => sum + key.length + value.length,
        0,
      ) <= 16_384
    );
  }, "Multipart metadata exceeds its bounds or duplicates the file field");
const metadataNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z][A-Za-z0-9_]*$/)
  .refine(
    (value) =>
      !["statusCode", "__proto__", "constructor", "prototype"].includes(value),
  );
export const fileHttpMetadataSelectionSchema: z.ZodType<FileHttpMetadataSelection> =
  z
    .record(
      metadataNameSchema,
      z
        .array(
          z.union([
            z
              .string()
              .min(1)
              .max(64)
              .refine(
                (value) =>
                  !["__proto__", "constructor", "prototype"].includes(value),
              ),
            z.number().int().min(0).max(1024),
          ]),
        )
        .min(1)
        .max(8),
    )
    .refine(
      (value) =>
        Object.keys(value).length > 0 && Object.keys(value).length <= 15,
    );
export const fileHttpMetadataValueSchema: z.ZodType<string | number | boolean> =
  z.union([z.string().max(1024), z.number().finite(), z.boolean()]);

interface MultipartFraming {
  contentType: string;
  prefix: Uint8Array;
  suffix: Uint8Array;
}
/** Actor-only framing; never concatenate the file with these metadata chunks. */
export function createMultipartFraming(
  input: FileHttpMultipart,
): MultipartFraming {
  const options = fileHttpMultipartSchema.parse(input);
  const boundary = `brains-${randomUUID()}`;
  let prefix = "";
  for (const [name, value] of Object.entries(options.fields))
    prefix += `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
  const filename = options.filename.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  prefix += `--${boundary}\r\nContent-Disposition: form-data; name="${options.fieldName}"; filename="${filename}"\r\nContent-Type: ${options.mimeType}\r\n\r\n`;
  const encoded = new TextEncoder().encode(prefix);
  if (encoded.byteLength > 32_768)
    throw new Error("Multipart framing exceeds its byte limit");
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    prefix: encoded,
    suffix: new TextEncoder().encode(`\r\n--${boundary}--\r\n`),
  };
}

/** Actor-only bounded JSON decoding. The transfer owns and joins socket retirement. */
export async function readHttpMetadata(
  response: IncomingMessage,
  selection: FileHttpMetadataSelection,
): Promise<FileHttpMetadata> {
  const fields = fileHttpMetadataSelectionSchema.parse(selection);
  const limit = 65_536;
  const encoding = response.headers["content-encoding"];
  if (encoding && encoding.toLowerCase() !== "identity")
    throw new Error(
      "HTTP metadata response has an unsupported content encoding",
    );
  const length = response.headers["content-length"];
  if (
    length !== undefined &&
    (!/^\d+$/.test(length) ||
      !Number.isSafeInteger(Number(length)) ||
      Number(length) > limit)
  )
    throw new Error("HTTP metadata response exceeds its byte limit");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let text = "";
  for await (const value of response.iterator({ destroyOnReturn: false })) {
    if (!(value instanceof Uint8Array))
      throw new Error("HTTP metadata response is not a byte stream");
    size += value.byteLength;
    if (size > limit)
      throw new Error("HTTP metadata response exceeds its byte limit");
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  const parsed: unknown = JSON.parse(text);
  const metadata: FileHttpMetadata = {};
  for (const [name, path] of Object.entries(fields)) {
    let value: unknown = parsed;
    for (const segment of path) {
      if (
        typeof value !== "object" ||
        value === null ||
        !Object.hasOwn(value, segment)
      )
        throw new Error("HTTP metadata response is missing a selected field");
      value = Reflect.get(value, segment);
    }
    metadata[name] = fileHttpMetadataValueSchema.parse(value);
  }
  return metadata;
}

import type { Socket } from "node:net";
import type { Readable } from "node:stream";
import { z } from "@brains/utils/zod";
import { STAGE_CHUNK_BYTES } from "./binary-protocol";

export const NETWORK_SCRATCH_BYTES: number = 128 * 1024;
export const NETWORK_BORROW_BYTES: number = 64 * 1024;
export const CREDIT_HEADER_BYTES = 41;
export const DATA_HEADER_BYTES = 45;
export const SEAL_BYTES = 69;
export { binaryUploadEndpointSchema as networkEndpointSchema } from "../binary-publication";
export type { BinaryUploadEndpoint as NetworkEndpoint } from "../binary-publication";
const creditSchema = z.strictObject({
  sequence: z.number().int().min(0).max(0xffffffff),
  credit: z.string().uuid(),
});
export interface NetworkCredit {
  sequence: number;
  credit: string;
}
export interface NetworkDataHeader extends NetworkCredit {
  kind: "chunk" | "finish";
  size: number;
}
export function encodeCredit(input: NetworkCredit): Buffer {
  const value = creditSchema.parse({
    sequence: input.sequence,
    credit: input.credit,
  });
  const bytes = Buffer.alloc(CREDIT_HEADER_BYTES);
  bytes[0] = 0x43;
  bytes.writeUInt32BE(value.sequence, 1);
  bytes.write(value.credit, 5, "ascii");
  return bytes;
}
export function decodeCredit(bytes: Uint8Array): NetworkCredit {
  if (bytes.byteLength !== CREDIT_HEADER_BYTES || bytes[0] !== 0x43)
    throw new Error("Invalid network credit header");
  return creditSchema.parse({
    sequence: new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    ).getUint32(1),
    credit: Buffer.from(bytes.buffer, bytes.byteOffset + 5, 36).toString(
      "utf8",
    ),
  });
}
export function encodeData(input: NetworkDataHeader): Buffer {
  const credit = encodeCredit(input);
  const bytes = Buffer.alloc(DATA_HEADER_BYTES);
  bytes.set(credit);
  bytes[0] = input.kind === "chunk" ? 0x44 : 0x46;
  bytes.writeUInt32BE(input.size, 41);
  return bytes;
}
export function parseDataHeader(bytes: Uint8Array): NetworkDataHeader {
  if (
    bytes.byteLength !== DATA_HEADER_BYTES ||
    (bytes[0] !== 0x44 && bytes[0] !== 0x46)
  )
    throw new Error("Invalid network data header");
  const header = Uint8Array.from(bytes.subarray(0, CREDIT_HEADER_BYTES));
  header[0] = 0x43;
  const credit = decodeCredit(header);
  const size = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).getUint32(41);
  const kind = bytes[0] === 0x44 ? "chunk" : "finish";
  if (size > STAGE_CHUNK_BYTES || (kind === "chunk" ? size === 0 : size !== 0))
    throw new Error("Network payload exceeds credit or has invalid size");
  return { ...credit, kind, size };
}
export function decodeData(
  bytes: Uint8Array,
  expected: NetworkCredit,
): NetworkDataHeader {
  const header = parseDataHeader(bytes);
  if (
    header.sequence !== expected.sequence ||
    header.credit !== expected.credit
  )
    throw new Error("Invalid network credit sequence");
  return header;
}
/** One bounded borrowed socket view at a time; copy visible bytes, never transfer
 * or retain pooled backing. Stream/kernel buffers and GC are separate, not RSS proof. */
export function readInto(
  socket: Readable,
  destination: Uint8Array,
): Promise<void> {
  if (destination.byteLength > STAGE_CHUNK_BYTES)
    return Promise.reject(new Error("Network receive exceeds credit"));
  return new Promise((resolve, reject) => {
    let offset = 0;
    const cleanup = (): void => {
      socket.off("readable", readable);
      socket.off("end", ended);
      socket.off("close", ended);
      socket.off("error", failed);
    };
    const failed = (error: unknown): void => {
      cleanup();
      reject(error);
    };
    const ended = (): void =>
      failed(
        new Error("Network stream ended before its credited frame completed"),
      );
    const readable = (): void => {
      try {
        while (offset < destination.byteLength) {
          const available = Math.min(
            socket.readableLength,
            destination.byteLength - offset,
          );
          if (available === 0) {
            if (socket.readableEnded || socket.destroyed) ended();
            return;
          }
          const bytes: unknown = socket.read(available);
          if (
            !(bytes instanceof Uint8Array) ||
            bytes.byteLength !== available ||
            bytes.buffer.byteLength > NETWORK_BORROW_BYTES
          )
            throw new Error("Invalid network receive backing");
          destination.set(bytes, offset);
          offset += bytes.byteLength;
        }
        cleanup();
        resolve();
      } catch (error) {
        failed(error);
      }
    };
    socket.on("readable", readable);
    socket.once("end", ended);
    socket.once("close", ended);
    socket.once("error", failed);
    readable();
  });
}
export async function readFixed(socket: Socket, size: number): Promise<Buffer> {
  if (!Number.isInteger(size) || size < 0 || size > SEAL_BYTES)
    throw new Error("Invalid network metadata length");
  const bytes = Buffer.alloc(size);
  await readInto(socket, bytes);
  return bytes;
}
export function writeBytes(socket: Socket, bytes: Uint8Array): Promise<void> {
  if (bytes.byteLength > STAGE_CHUNK_BYTES)
    return Promise.reject(new Error("Network write exceeds credit"));
  return new Promise((resolve, reject) => {
    socket.write(bytes, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
export function endSocket(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    const failed = (error: Error): void => {
      socket.off("close", closed);
      reject(error);
    };
    const closed = (): void => {
      socket.off("error", failed);
      resolve();
    };
    socket.once("error", failed);
    socket.once("close", closed);
    socket.end();
  });
}

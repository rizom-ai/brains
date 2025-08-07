import { customType } from "drizzle-orm/sqlite-core";

/**
 * Custom type for libSQL vector columns
 * This allows us to use F32_BLOB in libSQL while maintaining Drizzle compatibility
 */
export const vector = customType<{
  data: Float32Array;
  driverData: Buffer;
}>({
  dataType() {
    return "F32_BLOB(384)"; // 384 dimensions for all-MiniLM-L6-v2
  },
  toDriver(value: Float32Array): Buffer {
    return Buffer.from(value.buffer);
  },
  fromDriver(value: Buffer): Float32Array {
    return new Float32Array(
      value.buffer,
      value.byteOffset,
      value.byteLength / 4,
    );
  },
});

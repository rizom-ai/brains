import { customType } from "drizzle-orm/sqlite-core";

/**
 * Custom type for libSQL vector columns.
 * This allows us to use F32_BLOB in libSQL while maintaining Drizzle compatibility.
 *
 * Note: This schema is only used for the entity DB's Drizzle migration (legacy).
 * The actual embedding DB uses raw SQL with provider-supplied dimensions.
 * The dimension here must match the Drizzle migration SQL but does not
 * constrain the embedding DB.
 */
export const vector = customType<{
  data: Float32Array;
  driverData: Buffer;
}>({
  dataType() {
    return "F32_BLOB(1536)";
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

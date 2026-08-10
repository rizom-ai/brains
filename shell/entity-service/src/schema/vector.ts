import { customType } from "drizzle-orm/sqlite-core";

interface VectorCustomTypeValues {
  data: Float32Array;
  driverData: Buffer;
}

/**
 * Custom type for libSQL vector columns.
 * This allows us to use F32_BLOB in libSQL while maintaining Drizzle compatibility.
 *
 * The declared dimension is migration metadata. Runtime writes separately
 * validate vectors against the active embedding provider's dimensions.
 */
export const vector: ReturnType<typeof customType<VectorCustomTypeValues>> =
  customType<VectorCustomTypeValues>({
    dataType() {
      return "F32_BLOB(1536)";
    },
    toDriver(value: Float32Array): Buffer {
      return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    },
    fromDriver(value: Buffer): Float32Array {
      const bytes = new Uint8Array(value.byteLength);
      bytes.set(
        new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
      );
      return new Float32Array(bytes.buffer);
    },
  });

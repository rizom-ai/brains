import { isRecord } from "@brains/utils/is-record";

/**
 * A record without the addresses of the blobs it names: an upload's address
 * is the PDS's, and a record built without uploading cannot know it.
 */
function withoutBlobAddresses(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutBlobAddresses);
  if (!isRecord(value)) return value;
  const isBlob = value["$type"] === "blob";
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !(isBlob && key === "ref"))
      .map(([key, field]) => [key, withoutBlobAddresses(field)]),
  );
}

/** Whether the record a repo holds is the one the entity builds today. */
export function isCurrentRecord(
  stored: Record<string, unknown>,
  built: Record<string, unknown>,
): boolean {
  return Bun.deepEquals(
    withoutBlobAddresses(stored),
    withoutBlobAddresses(built),
  );
}

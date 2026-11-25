import type { AtprotoPdsClientLike } from "@brains/atproto-contracts";
import { isRecord } from "@brains/utils/is-record";

type ListRecords = NonNullable<AtprotoPdsClientLike["listRecords"]>;
type ListedRecord = Awaited<ReturnType<ListRecords>>["records"][number];

/** The most records `com.atproto.repo.listRecords` returns in one page. */
const LIST_PAGE_SIZE = 100;

/** Every record of a collection, by record key, read a page at a time. */
export async function listCollectionRecords(
  listRecords: ListRecords,
  input: { repo: string; collection: string },
): Promise<Map<string, Record<string, unknown>>> {
  const readFrom = async (
    cursor: string | undefined,
    seen: ListedRecord[],
  ): Promise<ListedRecord[]> => {
    const page = await listRecords({
      ...input,
      limit: LIST_PAGE_SIZE,
      ...(cursor !== undefined && { cursor }),
    });
    const records = [...seen, ...page.records];
    // A page that brings nothing ends the listing whatever cursor it names.
    return page.cursor !== undefined && page.records.length > 0
      ? readFrom(page.cursor, records)
      : records;
  };
  const records = await readFrom(undefined, []);
  return new Map(
    records.flatMap((record) => {
      const rkey = record.uri.split("/").at(-1);
      return rkey ? [[rkey, record.value] as const] : [];
    }),
  );
}

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

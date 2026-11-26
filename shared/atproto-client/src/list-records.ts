import type { AtprotoPdsClientLike } from "@brains/atproto-contracts";

type ListRecords = NonNullable<AtprotoPdsClientLike["listRecords"]>;

/** A record as a repo lists it: where it is, which version, and what it says. */
export type ListedRecord = Awaited<ReturnType<ListRecords>>["records"][number];

/** The most records `com.atproto.repo.listRecords` returns in one page. */
export const MAX_LIST_PAGE_SIZE = 100;

/** Every record of a collection, read a page at a time. */
export async function listAllRecords(
  listRecords: ListRecords,
  input: { repo: string; collection: string; pageSize?: number | undefined },
): Promise<ListedRecord[]> {
  const { repo, collection, pageSize = MAX_LIST_PAGE_SIZE } = input;
  const readFrom = async (
    cursor: string | undefined,
    seen: ListedRecord[],
  ): Promise<ListedRecord[]> => {
    const page = await listRecords({
      repo,
      collection,
      limit: pageSize,
      ...(cursor !== undefined && { cursor }),
    });
    const records = [...seen, ...page.records];
    // A page that brings nothing ends the listing whatever cursor it names.
    return page.cursor !== undefined && page.records.length > 0
      ? readFrom(page.cursor, records)
      : records;
  };
  return readFrom(undefined, []);
}

/** The record key an `at://` URI ends with. */
export function recordKeyOf(uri: string): string | undefined {
  return /^at:\/\/[^/]+\/[^/]+\/([^/]+)$/.exec(uri)?.[1];
}

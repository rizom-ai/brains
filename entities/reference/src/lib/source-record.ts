import {
  recordKeyOf,
  type ListedRecord,
  type PublicRepo,
} from "@brains/atproto-client";
import { z } from "@brains/utils/zod";
import type { ReferenceMetadata } from "../schemas/reference";

/** The collection each kind of entity a reference may point to is read from. */
export const REFERENCE_COLLECTIONS: Readonly<Record<string, string>> = {
  post: "ai.rizom.brain.post",
  deck: "ai.rizom.brain.deck",
  project: "ai.rizom.brain.project",
  series: "ai.rizom.brain.series",
};

/** The kind of entity a record of a collection is, when a reference may point to it. */
function kindOfCollection(collection: string | undefined): string | undefined {
  return Object.entries(REFERENCE_COLLECTIONS).find(
    ([, name]) => name === collection,
  )?.[0];
}

const BRAIN_CARD = { collection: "ai.rizom.brain.card", rkey: "self" };

// Pages are kept small: a post record carries its whole body.
const LIST_PAGE_SIZE = 10;

/**
 * What a reference reads from a record. The record's `body` is not named,
 * so parsing drops it: a reference never holds what it points to.
 */
const sourceRecordSchema = z.object({
  title: z.string(),
  summary: z.string().optional(),
  description: z.string().optional(),
  canonicalUrl: z.url().optional(),
  pageUrl: z.url().optional(),
  publishedAt: z.string().optional(),
  createdAt: z.string(),
  series: z.string().optional(),
  sourceEntityType: z.string().optional(),
  sourceEntityId: z.string().optional(),
  brainDid: z.string().optional(),
});

const brainCardSchema = z.object({
  anchor: z.object({ name: z.string().min(1) }),
});

/** The fields a reference takes from its source, and keeps current. */
export type SourceFields = Pick<
  ReferenceMetadata,
  | "title"
  | "summary"
  | "author"
  | "authorSite"
  | "url"
  | "publishedAt"
  | "series"
  | "sourceUri"
  | "sourceEntityType"
  | "sourceEntityId"
  | "sourceBrain"
>;

/** An address as two records are compared by it: no fragment, no trailing slash. */
function comparableUrl(address: string): string | undefined {
  try {
    const url = new URL(address);
    url.hash = "";
    return url.href.replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

/** The record a repo publishes for an address: the one whose `canonicalUrl` it is. */
export async function findRecordByAddress(
  repo: PublicRepo,
  address: string,
): Promise<ListedRecord | undefined> {
  const wanted = comparableUrl(address);
  const listed = await Promise.all(
    Object.values(REFERENCE_COLLECTIONS).map((collection) =>
      repo.listRecords(collection, { pageSize: LIST_PAGE_SIZE }),
    ),
  );
  // Its page on the author's brain, or the address it was first published at.
  return listed
    .flat()
    .find((record) =>
      [record.value["pageUrl"], record.value["canonicalUrl"]].some(
        (address) =>
          typeof address === "string" && comparableUrl(address) === wanted,
      ),
    );
}

/** The name the author gave their own brain's anchor, from their brain card. */
export async function readAuthorName(repo: PublicRepo): Promise<string> {
  const card = brainCardSchema.safeParse(
    (await repo.getRecord(BRAIN_CARD)).value,
  );
  if (!card.success) {
    throw new Error(`The brain card of ${repo.repoDid} names no author`);
  }
  return card.data.anchor.name;
}

/**
 * A record as the fields a reference shows and where it came from. Refused
 * when the record names no address to send a reader to.
 */
export function sourceFieldsOf(
  record: ListedRecord,
  author: string,
): SourceFields {
  const parsed = sourceRecordSchema.safeParse(record.value);
  if (!parsed.success) {
    throw new Error(`${record.uri} is not a record a reference can show`);
  }
  const source = parsed.data;
  // A reader is sent to the author's own brain, wherever the piece first
  // appeared; a record that names no page there has its one address.
  const url = source.pageUrl ?? source.canonicalUrl;
  if (!url) {
    throw new Error(`${record.uri} names no address, so it cannot be featured`);
  }
  const summary = source.summary ?? source.description;
  // A record that does not say what it came from is named by where it is.
  const sourceEntityType =
    source.sourceEntityType ??
    kindOfCollection(/^at:\/\/[^/]+\/([^/]+)\//.exec(record.uri)?.[1]);
  const sourceEntityId = source.sourceEntityId ?? recordKeyOf(record.uri);
  if (!sourceEntityType || !sourceEntityId) {
    throw new Error(`${record.uri} does not say what it is a record of`);
  }
  return {
    title: source.title,
    ...(summary !== undefined && { summary }),
    author,
    authorSite: new URL(url).host,
    url,
    publishedAt: source.publishedAt ?? source.createdAt,
    ...(source.series !== undefined && { series: source.series }),
    sourceUri: record.uri,
    sourceEntityType,
    sourceEntityId,
    ...(source.brainDid !== undefined && { sourceBrain: source.brainDid }),
  };
}

import type { EntitiesRestated } from "@brains/sdk/internal/service-runtime";
import { sourceKey } from "./topic-extraction-decisions";
import type { TopicExtractionStores } from "./topic-extraction-run";

/**
 * A restated row is the same source under a new content hash
 * (docs/plans/one-stored-form.md): the vote cast on it and its failed
 * attempts move to the new hash, so it is not read again. A vote cast
 * under another hash belongs to an edit and stays as it is.
 */
export async function carryRestatedSources(
  stores: Pick<TopicExtractionStores, "votes" | "failures">,
  restated: EntitiesRestated["entities"],
): Promise<void> {
  await restated.reduce<Promise<void>>(async (previous, row) => {
    await previous;
    const key = sourceKey({ entityType: row.entityType, id: row.entityId });
    const vote = await stores.votes.get(key);
    if (vote?.contentHash === row.previousHash) {
      await stores.votes.compareAndSet(key, vote, {
        ...vote,
        contentHash: row.contentHash,
      });
    }
    const failure = await stores.failures.get(key);
    if (failure?.contentHash === row.previousHash) {
      await stores.failures.compareAndSet(key, failure, {
        ...failure,
        contentHash: row.contentHash,
      });
    }
  }, Promise.resolve());
}

import { describe, expect, it } from "bun:test";
import { createMockEntityService } from "@brains/entity-service/test";
import { createMockEntityPluginContext } from "@brains/plugins/test";
import { carryRestatedSources } from "../../src/lib/restated-sources";
import { topicExtractionStores } from "../../src/lib/topic-extraction-run";
import type { TopicVote } from "../../src/schemas/votes";

/**
 * A quiet rewrite restates a row under a new content hash
 * (docs/external-plugin-authoring.md, The stored format). Its vote and its failure count move to
 * the new hash, so the source is not read again for a restatement.
 */
describe("a restated source's votes", () => {
  const vote = (contentHash: string): TopicVote => ({
    contentHash,
    promptVersion: "v1",
    visibility: "public",
    supported: [{ slug: "cities", title: "Cities", relevanceScore: 0.9 }],
    proposal: null,
  });

  function stores(): ReturnType<typeof topicExtractionStores> {
    return topicExtractionStores(
      createMockEntityPluginContext({
        entityService: createMockEntityService(),
      }),
    );
  }

  it("move from the hash the row had to the one it has", async () => {
    const s = stores();
    await s.votes.set("post:one", vote("before"));
    await s.failures.set("post:two", { contentHash: "old", attempts: 2 });

    await carryRestatedSources(s, [
      {
        entityType: "post",
        entityId: "one",
        previousHash: "before",
        contentHash: "after",
      },
      {
        entityType: "post",
        entityId: "two",
        previousHash: "old",
        contentHash: "new",
      },
    ]);

    expect(await s.votes.get("post:one")).toEqual(vote("after"));
    expect(await s.failures.get("post:two")).toEqual({
      contentHash: "new",
      attempts: 2,
    });
  });

  it("leave a vote cast under another hash, as an edit makes it", async () => {
    const s = stores();
    await s.votes.set("post:one", vote("edited"));

    await carryRestatedSources(s, [
      {
        entityType: "post",
        entityId: "one",
        previousHash: "before",
        contentHash: "after",
      },
    ]);

    expect(await s.votes.get("post:one")).toEqual(vote("edited"));
  });
});

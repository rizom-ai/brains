import { describe, expect, it } from "bun:test";
import type { BaseEntity } from "@brains/plugins";
import { createTopicBody } from "../../src/lib/topic-body";
import { topicsDataSource } from "../../src/datasources/topics-datasource";

const LONG_BODY = "Sentence one. ".repeat(40);

function topicEntity(id: string, title: string, content: string): BaseEntity {
  return {
    id,
    entityType: "topic",
    content: createTopicBody({ title, content }),
    contentHash: `hash-${id}`,
    visibility: "public",
    metadata: {},
    created: "2026-01-01T00:00:00.000Z",
    updated: "2026-01-02T00:00:00.000Z",
  };
}

describe("topics data source", () => {
  it("keeps a topic whole in the transform and truncates only in the list", () => {
    const transformed = topicsDataSource.transform(
      topicEntity("long-topic", "Long Topic", LONG_BODY),
    );

    // The transform is a faithful projection; a detail page renders it.
    expect(transformed.content).toBe(LONG_BODY.trim());
    expect(transformed.title).toBe("Long Topic");

    const listed = topicsDataSource.list([transformed], null, {});
    const summary = listed.topics[0]?.summary ?? "";
    expect(summary.length).toBeLessThan(transformed.content.length);
    expect(listed.totalCount).toBe(1);
  });

  it("scopes its id locally so the runtime can namespace it", () => {
    // Declared as "entities", not "topics:entities" — the runtime prefixes
    // the package id, and a pre-prefixed id resolves to nothing.
    expect(topicsDataSource.id).toBe("entities");
  });
});

import { describe, expect, it } from "bun:test";
import type { BaseEntity } from "@brains/plugins";
import { TopicAdapter } from "../../src/lib/topic-adapter";
import {
  getTopicTitle,
  toTopicContentProjection,
  toTopicContentProjectionWithMetadata,
  toTopicDetail,
  toTopicSummary,
} from "../../src/lib/topic-presenter";

const adapter = new TopicAdapter();

function createTopic(content: string, metadata = {}): BaseEntity {
  return {
    id: "human-ai-collaboration",
    entityType: "topic",
    content,
    contentHash: "hash",
    metadata,
    created: "2026-01-01T00:00:00.000Z",
    updated: "2026-01-02T00:00:00.000Z",
  };
}

describe("topic presenter", () => {
  const topic = createTopic(
    adapter.createTopicBody({
      title: "Human-AI Collaboration",
      content: "Humans and AI systems coordinate work across a long process.",
    }),
    { aliases: ["AI Collaboration"] },
  );

  it("extracts topic titles", () => {
    expect(getTopicTitle(topic)).toBe("Human-AI Collaboration");
  });

  it("creates list summaries", () => {
    expect(toTopicSummary(topic, 18)).toEqual({
      id: "human-ai-collaboration",
      title: "Human-AI Collaboration",
      summary: "Humans and AI...",
      created: "2026-01-01T00:00:00.000Z",
      updated: "2026-01-02T00:00:00.000Z",
    });
  });

  it("creates detail projections", () => {
    expect(toTopicDetail(topic)).toEqual({
      id: "human-ai-collaboration",
      title: "Human-AI Collaboration",
      content: "Humans and AI systems coordinate work across a long process.",
      created: "2026-01-01T00:00:00.000Z",
      updated: "2026-01-02T00:00:00.000Z",
    });
  });

  it("creates content projections with optional metadata", () => {
    expect(toTopicContentProjection(topic)).toEqual({
      id: "human-ai-collaboration",
      title: "Human-AI Collaboration",
      content: "Humans and AI systems coordinate work across a long process.",
    });
    expect(toTopicContentProjectionWithMetadata(topic)).toEqual({
      id: "human-ai-collaboration",
      title: "Human-AI Collaboration",
      content: "Humans and AI systems coordinate work across a long process.",
      metadata: { aliases: ["AI Collaboration"] },
    });
  });
});

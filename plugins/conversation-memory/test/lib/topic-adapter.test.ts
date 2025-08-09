import { describe, it, expect } from "bun:test";
import { ConversationTopicAdapter } from "../../src/lib/topic-adapter";
import type { ConversationTopic } from "../../src/schemas/topic";

describe("ConversationTopicAdapter", () => {
  const adapter = new ConversationTopicAdapter();

  describe("serialization and deserialization", () => {
    it("should round-trip a complete topic without data loss", () => {
      const originalTopic: ConversationTopic = {
        id: "test-id",
        entityType: "conversation-topic",
        content:
          "# Topic Summary\n\n## Key Takeaways\n- Point 1\n- Point 2\n\n## Context\nDiscussion about project planning",
        metadata: {
          title: "Project Planning Discussion",
          messageCount: 25,
          lastUpdated: "2024-01-15T10:00:00Z",
        },
        created: "2024-01-15T09:00:00Z",
        updated: "2024-01-15T10:00:00Z",
      };

      const markdown = adapter.toMarkdown(originalTopic);
      const deserializedTopic = adapter.fromMarkdown(markdown);

      expect(deserializedTopic.content).toBe(originalTopic.content);
      expect(deserializedTopic.metadata).toEqual(originalTopic.metadata);
    });

    it("should preserve complex content structure", () => {
      const complexContent = `## Key Takeaways
- Implement async processing
- Add retry logic with exponential backoff
- Monitor performance metrics

## Context
Team discussion in #engineering channel
Participants: Alice (lead), Bob (backend), Charlie (frontend)
Date: 2024-01-15

## Summary
The team agreed on implementing a new async processing system...`;

      const topic: ConversationTopic = {
        id: "complex-id",
        entityType: "conversation-topic",
        content: complexContent,
        metadata: {
          title: "Async Processing Architecture",
          messageCount: 42,
          lastUpdated: "2024-01-15T14:30:00Z",
        },
        created: "2024-01-15T09:00:00Z",
        updated: "2024-01-15T14:30:00Z",
      };

      const markdown = adapter.toMarkdown(topic);
      const result = adapter.fromMarkdown(markdown);

      expect(result.content).toBe(complexContent);
    });
  });

  describe("validation", () => {
    it("should accept valid conversation topics", () => {
      const validTopic: ConversationTopic = {
        id: "valid-id",
        entityType: "conversation-topic",
        content: "Summary content here",
        metadata: {
          title: "Valid Topic",
          messageCount: 10,
          lastUpdated: "2024-01-15T10:00:00Z",
        },
        created: "2024-01-15T09:00:00Z",
        updated: "2024-01-15T10:00:00Z",
      };

      expect(() => {
        adapter.schema.parse(validTopic);
      }).not.toThrow();
    });

    it("should reject topics with wrong entity type", () => {
      const invalidTopic = {
        id: "invalid-id",
        entityType: "note", // Wrong type
        content: "Content",
        metadata: {
          title: "Topic",
          messageCount: 5,
          lastUpdated: "2024-01-15T10:00:00Z",
        },
        created: "2024-01-15T09:00:00Z",
        updated: "2024-01-15T10:00:00Z",
      };

      expect(() => {
        adapter.schema.parse(invalidTopic);
      }).toThrow();
    });

    it("should reject topics with missing required metadata", () => {
      const incompleteMarkdown = `---
title: Missing Message Count
lastUpdated: '2024-01-15T10:00:00Z'
---

Content here`;

      expect(() => {
        adapter.fromMarkdown(incompleteMarkdown);
      }).toThrow();
    });
  });
});

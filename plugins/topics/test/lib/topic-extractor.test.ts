import { describe, it, expect, beforeEach, mock } from "bun:test";
import { TopicExtractor } from "../../src/lib/topic-extractor";
import { MockShell } from "@brains/core/test";
import { createServicePluginContext } from "@brains/plugins";
import type { ServicePluginContext } from "@brains/plugins";
import type { Message } from "@brains/conversation-service";
import type { ExtractedTopic } from "../../src/types";
import { Logger } from "@brains/utils";

describe("TopicExtractor", () => {
  let extractor: TopicExtractor;
  let context: ServicePluginContext;
  let logger: Logger;
  let mockShell: MockShell;

  beforeEach(async () => {
    logger = Logger.getInstance().child("test");
    mockShell = new MockShell({ logger });

    // Create service plugin context with mock shell
    context = createServicePluginContext(mockShell, "topics", logger);

    extractor = new TopicExtractor(context, logger);
  });

  describe("extractFromConversationWindow", () => {
    const mockMessages: Message[] = [
      {
        id: "msg-1",
        conversationId: "conv-123",
        role: "user",
        content: "What is machine learning?",
        timestamp: new Date("2024-01-01T10:00:00Z"),
      },
      {
        id: "msg-2",
        conversationId: "conv-123",
        role: "assistant",
        content:
          "Machine learning is a subset of artificial intelligence that enables systems to learn from data.",
        timestamp: new Date("2024-01-01T10:01:00Z"),
      },
    ];

    it("should extract topics from a conversation window", async () => {
      // Mock getMessages to return our test messages
      context.getMessages = mock(async (convId: string, options?: any) => {
        if (convId === "conv-123" && options?.range) {
          const { start, end } = options.range;
          return mockMessages.slice(start - 1, end);
        }
        return [];
      });

      // Mock generateContent to return extracted topics
      context.generateContent = mock(async () => ({
        topics: [
          {
            title: "Machine Learning Fundamentals",
            summary: "An introduction to machine learning concepts",
            content:
              "Machine learning is a subset of AI that enables systems to learn from data.",
            keywords: ["machine learning", "AI", "data"],
            relevanceScore: 0.9,
          },
        ],
      }));

      const result = await extractor.extractFromConversationWindow(
        "conv-123",
        1,
        2,
        0.5,
      );

      expect(context.getMessages).toHaveBeenCalledWith("conv-123", {
        range: { start: 1, end: 2 },
      });
      expect(context.generateContent).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Machine Learning Fundamentals");
      expect(result[0].sources).toEqual(["conv-123"]);
    });

    it("should filter topics by relevance score", async () => {
      context.getMessages = mock(async () => mockMessages);
      context.generateContent = mock(async () => ({
        topics: [
          {
            title: "High Relevance Topic",
            summary: "Very relevant",
            content: "Important content",
            keywords: ["important"],
            relevanceScore: 0.9,
          },
          {
            title: "Low Relevance Topic",
            summary: "Not very relevant",
            content: "Less important",
            keywords: ["misc"],
            relevanceScore: 0.3,
          },
        ],
      }));

      const result = await extractor.extractFromConversationWindow(
        "conv-123",
        1,
        2,
        0.8,
      );

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("High Relevance Topic");
    });

    it("should handle empty message windows", async () => {
      context.getMessages = mock(async () => []);
      const generateContentMock = mock(async () => ({ topics: [] }));
      context.generateContent = generateContentMock;

      const result = await extractor.extractFromConversationWindow(
        "conv-123",
        1,
        10,
        0.5,
      );

      expect(result).toEqual([]);
      expect(generateContentMock).not.toHaveBeenCalled();
    });

    it("should handle AI service errors gracefully", async () => {
      context.getMessages = mock(async () => mockMessages);
      context.generateContent = mock(async () => {
        throw new Error("AI service error");
      });

      await expect(
        extractor.extractFromConversationWindow("conv-123", 1, 2, 0.5),
      ).rejects.toThrow("AI service error");
    });

    it("should deduplicate topics by title", async () => {
      context.getMessages = mock(async () => mockMessages);
      context.generateContent = mock(async () => ({
        topics: [
          {
            title: "Machine Learning",
            summary: "First summary",
            content: "Content 1",
            keywords: ["ml"],
            relevanceScore: 0.8,
          },
          {
            title: "Machine Learning",
            summary: "Second summary",
            content: "Content 2",
            keywords: ["ml", "ai"],
            relevanceScore: 0.95,
          },
        ],
      }));

      const result = await extractor.extractFromConversationWindow(
        "conv-123",
        1,
        2,
        0.5,
      );

      // Should keep the one with higher relevance score
      expect(result).toHaveLength(1);
      expect(result[0].relevanceScore).toBe(0.95);
    });
  });
});

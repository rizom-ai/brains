import { describe, it, expect, beforeEach } from "bun:test";
import { SummaryExtractor } from "../../src/lib/summary-extractor";
import {
  MockShell,
  createServicePluginContext,
  createSilentLogger,
  type ServicePluginContext,
  type Logger,
} from "@brains/plugins";

describe("SummaryExtractor", () => {
  let extractor: SummaryExtractor;
  let context: ServicePluginContext;
  let logger: Logger;
  let mockShell: MockShell;

  beforeEach(async () => {
    logger = createSilentLogger();
    mockShell = new MockShell({ logger });

    // Create service plugin context with mock shell
    context = createServicePluginContext(mockShell, "summary", logger);

    extractor = new SummaryExtractor(context, logger);
  });

  describe("applyDecision", () => {
    it("should apply create decision", () => {
      const decision = {
        action: "create" as const,
        entry: {
          title: "New Discussion",
          content: "A new conversation about AI topics.",
          created: "2025-01-30T10:00:00Z",
          updated: "2025-01-30T10:00:00Z",
          windowStart: 1,
          windowEnd: 20,
          keyPoints: ["AI discussion", "Machine learning"],
          participants: ["user", "assistant"],
        },
      };

      const result = extractor.applyDecision(decision, null, "conv-123");

      expect(result).toContain("# Conversation Summary: conv-123");
      expect(result).toContain("New Discussion");
      expect(result).toContain("A new conversation about AI topics");
    });

    it("should apply append decision", () => {
      const existingContent = `# Conversation Summary: conv-123

Last updated: 2025-01-30T09:00:00Z
Total messages processed: 10

## Summary Log

### [Entry 1] Previous Discussion
*Created: 2025-01-30T09:00:00Z | Updated: 2025-01-30T09:00:00Z | Messages: 1-10*

Previous conversation about general topics.`;

      const decision = {
        action: "append" as const,
        entry: {
          title: "AI Deep Dive",
          content:
            "Detailed discussion about artificial intelligence concepts.",
          created: "2025-01-30T10:00:00Z",
          updated: "2025-01-30T10:00:00Z",
          windowStart: 11,
          windowEnd: 30,
          keyPoints: ["AI concepts", "Deep learning"],
          participants: ["user", "assistant"],
        },
      };

      const result = extractor.applyDecision(
        decision,
        existingContent,
        "conv-123",
      );

      expect(result).toContain("Previous Discussion");
      expect(result).toContain("AI Deep Dive");
      expect(result).toContain(
        "Detailed discussion about artificial intelligence",
      );
    });

    it("should apply update decision", () => {
      const existingContent = `# Conversation Summary: conv-123

## Metadata

**Total Messages:** 10
**Last Updated:** 2025-01-30T09:00:00Z

## Summary Log

### [Entry 1 - Updated 2025-01-30T09:00:00Z] Previous Discussion

## Content
*Created: 2025-01-30T09:00:00Z | Updated: 2025-01-30T09:00:00Z | Messages: 1-10*

Previous conversation about general topics.

## Window Start
1

## Window End
10

## Key Points

## Decisions

## Action Items

## Participants

---`;

      const decision = {
        action: "update" as const,
        entryIndex: 0,
        entry: {
          title: "Updated Discussion",
          content:
            "Updated conversation covering both general topics and AI concepts.",
          created: "2025-01-30T09:00:00Z",
          updated: "2025-01-30T10:00:00Z",
          windowStart: 1,
          windowEnd: 30,
          keyPoints: ["General topics", "AI concepts"],
          participants: ["user", "assistant"],
        },
      };

      const result = extractor.applyDecision(
        decision,
        existingContent,
        "conv-123",
      );

      expect(result).toContain("UPDATE: Updated conversation covering both");
      expect(result).toContain("Previous Discussion"); // Title stays the same in current implementation
    });
  });
});

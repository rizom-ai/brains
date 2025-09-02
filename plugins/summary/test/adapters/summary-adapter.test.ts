import { describe, it, expect, beforeEach } from "bun:test";
import { SummaryAdapter } from "../../src/adapters/summary-adapter";
import type { SummaryBody, SummaryLogEntry } from "../../src/schemas/summary";

describe("SummaryAdapter", () => {
  let adapter: SummaryAdapter;

  beforeEach(() => {
    adapter = new SummaryAdapter();
  });

  describe("createSummaryContent", () => {
    it("should create markdown from summary body with single entry", () => {
      const body: SummaryBody = {
        conversationId: "conv-123",
        entries: [
          {
            title: "Initial Discussion",
            content: "Team discussed project requirements",
            created: "2025-01-30T10:00:00Z",
            updated: "2025-01-30T10:00:00Z",
            windowStart: 1,
            windowEnd: 20,
          },
        ],
        totalMessages: 20,
        lastUpdated: "2025-01-30T10:00:00Z",
      };

      const markdown = adapter.createSummaryContent(body);

      expect(markdown).toContain("# Conversation Summary: conv-123");
      expect(markdown).toContain("**Total Messages:** 20");
      expect(markdown).toContain("**Last Updated:** 2025-01-30T10:00:00Z");
      expect(markdown).toContain(
        "### [2025-01-30T10:00:00Z] Initial Discussion",
      );
      expect(markdown).toContain("Team discussed project requirements");
      expect(markdown).toContain("## Window Start\n1");
      expect(markdown).toContain("## Window End\n20");
    });

    it("should show updated timestamp when entry was modified", () => {
      const body: SummaryBody = {
        conversationId: "conv-123",
        entries: [
          {
            title: "Budget Planning",
            content: "Initial budget discussion",
            created: "2025-01-30T10:00:00Z",
            updated: "2025-01-30T10:15:00Z",
            windowStart: 1,
            windowEnd: 30,
          },
        ],
        totalMessages: 30,
        lastUpdated: "2025-01-30T10:15:00Z",
      };

      const markdown = adapter.createSummaryContent(body);

      expect(markdown).toContain(
        "### [2025-01-30T10:00:00Z - Updated 2025-01-30T10:15:00Z] Budget Planning",
      );
    });

    it("should include optional fields when present", () => {
      const body: SummaryBody = {
        conversationId: "conv-123",
        entries: [
          {
            title: "Project Planning",
            content: "Discussed architecture",
            created: "2025-01-30T10:00:00Z",
            updated: "2025-01-30T10:00:00Z",
            windowStart: 1,
            windowEnd: 20,
            keyPoints: ["Use microservices", "Deploy on K8s"],
            decisions: ["Approved microservices architecture"],
            actionItems: ["Create architecture diagram", "Set up CI/CD"],
            participants: ["Alice", "Bob"],
          },
        ],
        totalMessages: 20,
        lastUpdated: "2025-01-30T10:00:00Z",
      };

      const markdown = adapter.createSummaryContent(body);

      expect(markdown).toContain(
        "## Key Points\n\n- Use microservices\n- Deploy on K8s",
      );
      expect(markdown).toContain(
        "## Decisions\n\n- Approved microservices architecture",
      );
      expect(markdown).toContain(
        "## Action Items\n\n- Create architecture diagram\n- Set up CI/CD",
      );
      expect(markdown).toContain("## Participants\n\n- Alice\n- Bob");
    });

    it("should handle multiple entries in newest-first order", () => {
      const body: SummaryBody = {
        conversationId: "conv-123",
        entries: [
          {
            title: "Latest Topic",
            content: "Most recent discussion",
            created: "2025-01-30T10:30:00Z",
            updated: "2025-01-30T10:30:00Z",
            windowStart: 21,
            windowEnd: 40,
          },
          {
            title: "Earlier Topic",
            content: "Previous discussion",
            created: "2025-01-30T10:15:00Z",
            updated: "2025-01-30T10:15:00Z",
            windowStart: 11,
            windowEnd: 30,
          },
          {
            title: "First Topic",
            content: "Initial discussion",
            created: "2025-01-30T10:00:00Z",
            updated: "2025-01-30T10:00:00Z",
            windowStart: 1,
            windowEnd: 20,
          },
        ],
        totalMessages: 40,
        lastUpdated: "2025-01-30T10:30:00Z",
      };

      const markdown = adapter.createSummaryContent(body);

      // Check order - latest should come first
      const latestIndex = markdown.indexOf("Latest Topic");
      const earlierIndex = markdown.indexOf("Earlier Topic");
      const firstIndex = markdown.indexOf("First Topic");

      expect(latestIndex).toBeLessThan(earlierIndex);
      expect(earlierIndex).toBeLessThan(firstIndex);
    });
  });

  describe("parseSummaryContent", () => {
    it("should parse markdown back to summary body", () => {
      const markdown = `# Conversation Summary: conv-123

## Metadata

**Total Messages:** 20
**Last Updated:** 2025-01-30T10:00:00Z

## Summary Log

### [2025-01-30T10:00:00Z] Initial Discussion

## Content

Team discussed project requirements

## Window Start

1

## Window End

20

---

`;

      const body = adapter.parseSummaryContent(markdown);

      expect(body.conversationId).toBe("conv-123");
      expect(body.totalMessages).toBe(20);
      expect(body.lastUpdated).toBe("2025-01-30T10:00:00Z");
      expect(body.entries).toHaveLength(1);
      expect(body.entries[0]?.title).toBe("Initial Discussion");
      expect(body.entries[0]?.content).toBe(
        "Team discussed project requirements",
      );
      expect(body.entries[0]?.windowStart).toBe(1);
      expect(body.entries[0]?.windowEnd).toBe(20);
    });

    it("should parse entry with updated timestamp", () => {
      const markdown = `# Conversation Summary: conv-123

## Metadata

**Total Messages:** 30
**Last Updated:** 2025-01-30T10:15:00Z

## Summary Log

### [2025-01-30T10:00:00Z - Updated 2025-01-30T10:15:00Z] Budget Planning

## Content

Budget discussion with updates

## Window Start

1

## Window End

30

---

`;

      const body = adapter.parseSummaryContent(markdown);

      expect(body.entries[0]?.created).toBe("2025-01-30T10:00:00Z");
      expect(body.entries[0]?.updated).toBe("2025-01-30T10:15:00Z");
    });

    it("should handle empty summary log", () => {
      const markdown = `# Conversation Summary: conv-123

## Metadata

**Total Messages:** 0
**Last Updated:** 2025-01-30T10:00:00Z

## Summary Log

`;

      const body = adapter.parseSummaryContent(markdown);

      expect(body.conversationId).toBe("conv-123");
      expect(body.entries).toHaveLength(0);
      expect(body.totalMessages).toBe(0);
    });
  });

  describe("roundtrip", () => {
    it("should maintain data integrity through format and parse", () => {
      const originalBody: SummaryBody = {
        conversationId: "conv-456",
        entries: [
          {
            title: "Architecture Discussion",
            content: "Detailed architecture planning session",
            created: "2025-01-30T14:00:00Z",
            updated: "2025-01-30T14:30:00Z",
            windowStart: 11,
            windowEnd: 30,
            keyPoints: ["Microservices", "Event-driven", "CQRS"],
            decisions: ["Use event sourcing"],
            actionItems: ["Design event schema"],
            participants: ["Alice", "Bob", "Charlie"],
          },
          {
            title: "Initial Planning",
            content: "Project kickoff meeting",
            created: "2025-01-30T13:00:00Z",
            updated: "2025-01-30T13:00:00Z",
            windowStart: 1,
            windowEnd: 20,
          },
        ],
        totalMessages: 30,
        lastUpdated: "2025-01-30T14:30:00Z",
      };

      const markdown = adapter.createSummaryContent(originalBody);
      const parsedBody = adapter.parseSummaryContent(markdown);

      expect(parsedBody.conversationId).toBe(originalBody.conversationId);
      expect(parsedBody.totalMessages).toBe(originalBody.totalMessages);
      expect(parsedBody.lastUpdated).toBe(originalBody.lastUpdated);
      expect(parsedBody.entries).toHaveLength(2);

      // Check first entry (with all optional fields)
      const firstEntry = parsedBody.entries[0];
      expect(firstEntry?.title).toBe("Architecture Discussion");
      expect(firstEntry?.content).toBe(
        "Detailed architecture planning session",
      );
      expect(firstEntry?.created).toBe("2025-01-30T14:00:00Z");
      expect(firstEntry?.updated).toBe("2025-01-30T14:30:00Z");
      expect(firstEntry?.windowStart).toBe(11);
      expect(firstEntry?.windowEnd).toBe(30);
      expect(firstEntry?.keyPoints).toEqual([
        "Microservices",
        "Event-driven",
        "CQRS",
      ]);
      expect(firstEntry?.decisions).toEqual(["Use event sourcing"]);
      expect(firstEntry?.actionItems).toEqual(["Design event schema"]);
      expect(firstEntry?.participants).toEqual(["Alice", "Bob", "Charlie"]);

      // Check second entry (minimal)
      const secondEntry = parsedBody.entries[1];
      expect(secondEntry?.title).toBe("Initial Planning");
      expect(secondEntry?.content).toBe("Project kickoff meeting");
      expect(secondEntry?.windowStart).toBe(1);
      expect(secondEntry?.windowEnd).toBe(20);
    });
  });

  describe("addOrUpdateEntry", () => {
    it("should create new summary when no existing content", () => {
      const newEntry: SummaryLogEntry = {
        title: "First Entry",
        content: "Initial content",
        created: "2025-01-30T10:00:00Z",
        updated: "2025-01-30T10:00:00Z",
        windowStart: 1,
        windowEnd: 20,
      };

      const markdown = adapter.addOrUpdateEntry(
        null,
        newEntry,
        "conv-789",
        false,
      );

      expect(markdown).toContain("# Conversation Summary: conv-789");
      expect(markdown).toContain("First Entry");
      expect(markdown).toContain("Initial content");
    });

    it("should prepend new entry to existing summary", () => {
      const existingMarkdown = adapter.createSummaryContent({
        conversationId: "conv-789",
        entries: [
          {
            title: "Old Entry",
            content: "Old content",
            created: "2025-01-30T10:00:00Z",
            updated: "2025-01-30T10:00:00Z",
            windowStart: 1,
            windowEnd: 20,
          },
        ],
        totalMessages: 20,
        lastUpdated: "2025-01-30T10:00:00Z",
      });

      const newEntry: SummaryLogEntry = {
        title: "New Entry",
        content: "New content",
        created: "2025-01-30T10:15:00Z",
        updated: "2025-01-30T10:15:00Z",
        windowStart: 11,
        windowEnd: 30,
      };

      const updatedMarkdown = adapter.addOrUpdateEntry(
        existingMarkdown,
        newEntry,
        "conv-789",
        false,
      );

      const body = adapter.parseSummaryContent(updatedMarkdown);

      expect(body.entries).toHaveLength(2);
      expect(body.entries[0]?.title).toBe("New Entry"); // Newest first
      expect(body.entries[1]?.title).toBe("Old Entry");
      expect(body.totalMessages).toBe(30);
    });

    it("should update existing entry when requested", () => {
      const existingMarkdown = adapter.createSummaryContent({
        conversationId: "conv-789",
        entries: [
          {
            title: "Topic A",
            content: "Initial discussion",
            created: "2025-01-30T10:00:00Z",
            updated: "2025-01-30T10:00:00Z",
            windowStart: 1,
            windowEnd: 20,
            keyPoints: ["Point 1"],
            decisions: ["Decision 1"],
          },
        ],
        totalMessages: 20,
        lastUpdated: "2025-01-30T10:00:00Z",
      });

      const updateEntry: SummaryLogEntry = {
        title: "Topic A",
        content: "Continued discussion",
        created: "2025-01-30T10:15:00Z",
        updated: "2025-01-30T10:15:00Z",
        windowStart: 11,
        windowEnd: 30,
        keyPoints: ["Point 2"],
        decisions: ["Decision 2"],
      };

      const updatedMarkdown = adapter.addOrUpdateEntry(
        existingMarkdown,
        updateEntry,
        "conv-789",
        true,
        0, // Update the most recent entry
      );

      const body = adapter.parseSummaryContent(updatedMarkdown);

      expect(body.entries).toHaveLength(1);
      expect(body.entries[0]?.content).toContain("Initial discussion");
      expect(body.entries[0]?.content).toContain(
        "UPDATE: Continued discussion",
      );
      expect(body.entries[0]?.updated).toBe("2025-01-30T10:15:00Z");
      expect(body.entries[0]?.windowEnd).toBe(30);
      expect(body.entries[0]?.keyPoints).toContain("Point 1");
      expect(body.entries[0]?.keyPoints).toContain("Point 2");
      expect(body.entries[0]?.decisions).toContain("Decision 1");
      expect(body.entries[0]?.decisions).toContain("Decision 2");
    });
  });

  describe("getRecentEntries", () => {
    it("should return the N most recent entries", () => {
      const markdown = adapter.createSummaryContent({
        conversationId: "conv-123",
        entries: [
          {
            title: "Entry 3",
            content: "c",
            created: "2025-01-30T12:00:00Z",
            updated: "2025-01-30T12:00:00Z",
            windowStart: 21,
            windowEnd: 30,
          },
          {
            title: "Entry 2",
            content: "b",
            created: "2025-01-30T11:00:00Z",
            updated: "2025-01-30T11:00:00Z",
            windowStart: 11,
            windowEnd: 20,
          },
          {
            title: "Entry 1",
            content: "a",
            created: "2025-01-30T10:00:00Z",
            updated: "2025-01-30T10:00:00Z",
            windowStart: 1,
            windowEnd: 10,
          },
        ],
        totalMessages: 30,
        lastUpdated: "2025-01-30T12:00:00Z",
      });

      const recent = adapter.getRecentEntries(markdown, 2);

      expect(recent).toHaveLength(2);
      expect(recent[0]?.title).toBe("Entry 3");
      expect(recent[1]?.title).toBe("Entry 2");
    });
  });
});

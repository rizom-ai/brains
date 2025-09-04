import {
  describe,
  it,
  expect,
  beforeEach,
} from "bun:test";
import { SummaryAdapter } from "../../src/adapters/summary-adapter";
import type { SummaryEntity, SummaryLogEntry } from "../../src/schemas/summary";

describe("SummaryAdapter", () => {
  let adapter: SummaryAdapter;

  beforeEach(() => {
    adapter = new SummaryAdapter();
  });

  describe("initialization", () => {
    it("should have correct entityType", () => {
      expect(adapter.entityType).toBe("summary");
    });

    it("should have a schema", () => {
      expect(adapter.schema).toBeDefined();
    });
  });

  describe("createSummaryContent", () => {
    it("should create markdown from summary body", () => {
      const body = {
        conversationId: "conv-123",
        entries: [
          {
            title: "Initial discussion",
            content: "User asked about project setup",
            created: "2025-01-01T00:00:00Z",
            updated: "2025-01-01T00:00:00Z",
            windowStart: 1,
            windowEnd: 50,
            keyPoints: ["Project setup", "Initial requirements"],
            decisions: ["Use TypeScript"],
            actionItems: ["Setup repository"],
            participants: ["user-1", "assistant"],
          },
        ],
        totalMessages: 50,
        lastUpdated: "2025-01-01T00:00:00Z",
      };

      const content = adapter.createSummaryContent(body);
      
      expect(content).toContain("# Conversation Summary: conv-123");
      expect(content).toContain("**Total Messages:** 50");
      expect(content).toContain("**Last Updated:** 2025-01-01T00:00:00Z");
      expect(content).toContain("### [2025-01-01T00:00:00Z] Initial discussion");
      expect(content).toContain("User asked about project setup");
      expect(content).toContain("## Window Start\n1");
      expect(content).toContain("## Window End\n50");
      expect(content).toContain("- Project setup");
      expect(content).toContain("- Use TypeScript");
      expect(content).toContain("- Setup repository");
    });

    it("should handle multiple entries in reverse chronological order", () => {
      const body = {
        conversationId: "conv-123",
        entries: [
          {
            title: "Recent topic",
            content: "Latest discussion",
            created: "2025-01-02T00:00:00Z",
            updated: "2025-01-02T00:00:00Z",
            windowStart: 51,
            windowEnd: 100,
          },
          {
            title: "Earlier topic",
            content: "Earlier discussion",
            created: "2025-01-01T00:00:00Z",
            updated: "2025-01-01T00:00:00Z",
            windowStart: 1,
            windowEnd: 50,
          },
        ],
        totalMessages: 100,
        lastUpdated: "2025-01-02T00:00:00Z",
      };

      const content = adapter.createSummaryContent(body);
      const recentIndex = content.indexOf("Recent topic");
      const earlierIndex = content.indexOf("Earlier topic");
      
      expect(recentIndex).toBeLessThan(earlierIndex);
    });

    it("should show updated timestamp when entry is updated", () => {
      const body = {
        conversationId: "conv-123",
        entries: [
          {
            title: "Discussion",
            content: "Content",
            created: "2025-01-01T00:00:00Z",
            updated: "2025-01-01T12:00:00Z",
            windowStart: 1,
            windowEnd: 50,
          },
        ],
        totalMessages: 50,
        lastUpdated: "2025-01-01T12:00:00Z",
      };

      const content = adapter.createSummaryContent(body);
      
      expect(content).toContain("[2025-01-01T00:00:00Z - Updated 2025-01-01T12:00:00Z]");
    });

    it("should handle empty entries array", () => {
      const body = {
        conversationId: "conv-123",
        entries: [],
        totalMessages: 0,
        lastUpdated: "2025-01-01T00:00:00Z",
      };

      const content = adapter.createSummaryContent(body);
      
      expect(content).toContain("# Conversation Summary: conv-123");
      expect(content).toContain("## Summary Log");
      expect(content).not.toContain("###");
    });
  });

  describe("parseSummaryContent", () => {
    it("should parse markdown back to summary body", () => {
      const markdown = `# Conversation Summary: conv-123

## Metadata

**Total Messages:** 50
**Last Updated:** 2025-01-01T00:00:00Z

## Summary Log

### [2025-01-01T00:00:00Z] Initial discussion

## Content
User asked about project setup

## Window Start
1

## Window End
50

## Key Points

- Project setup
- Initial requirements

## Decisions

- Use TypeScript

## Action Items

- Setup repository

## Participants

- user-1
- assistant

---

`;

      const body = adapter.parseSummaryContent(markdown);
      
      expect(body.conversationId).toBe("conv-123");
      expect(body.totalMessages).toBe(50);
      expect(body.lastUpdated).toBe("2025-01-01T00:00:00Z");
      expect(body.entries).toHaveLength(1);
      
      const entry = body.entries[0];
      expect(entry?.title).toBe("Initial discussion");
      expect(entry?.content).toBe("User asked about project setup");
      expect(entry?.windowStart).toBe(1);
      expect(entry?.windowEnd).toBe(50);
      expect(entry?.keyPoints).toContain("Project setup");
      expect(entry?.decisions).toContain("Use TypeScript");
      expect(entry?.actionItems).toContain("Setup repository");
    });

    it("should parse multiple entries", () => {
      const markdown = `# Conversation Summary: conv-123

## Metadata

**Total Messages:** 100
**Last Updated:** 2025-01-02T00:00:00Z

## Summary Log

### [2025-01-02T00:00:00Z] Recent topic

## Content
Latest discussion

## Window Start
51

## Window End
100

---

### [2025-01-01T00:00:00Z] Earlier topic

## Content
Earlier discussion

## Window Start
1

## Window End
50

---

`;

      const body = adapter.parseSummaryContent(markdown);
      
      expect(body.entries).toHaveLength(2);
      expect(body.entries[0]?.title).toBe("Recent topic");
      expect(body.entries[1]?.title).toBe("Earlier topic");
    });

    it("should handle updated entries", () => {
      const markdown = `# Conversation Summary: conv-123

## Metadata

**Total Messages:** 50
**Last Updated:** 2025-01-01T12:00:00Z

## Summary Log

### [2025-01-01T00:00:00Z - Updated 2025-01-01T12:00:00Z] Discussion

Content: Original content
UPDATE: Additional content
Window Start: 1
Window End: 50

---

`;

      const body = adapter.parseSummaryContent(markdown);
      
      expect(body.entries).toHaveLength(1);
      expect(body.entries[0]?.created).toBe("2025-01-01T00:00:00Z");
      expect(body.entries[0]?.updated).toBe("2025-01-01T12:00:00Z");
    });

    it("should handle empty summary log", () => {
      const markdown = `# Conversation Summary: conv-123

## Metadata

**Total Messages:** 0
**Last Updated:** 2025-01-01T00:00:00Z

## Summary Log

`;

      const body = adapter.parseSummaryContent(markdown);
      
      expect(body.conversationId).toBe("conv-123");
      expect(body.entries).toHaveLength(0);
      expect(body.totalMessages).toBe(0);
    });

    it("should handle missing metadata gracefully", () => {
      const markdown = `# Conversation Summary: conv-123

## Summary Log

`;

      const body = adapter.parseSummaryContent(markdown);
      
      expect(body.conversationId).toBe("conv-123");
      expect(body.totalMessages).toBe(0);
      expect(body.lastUpdated).toBeDefined();
    });
  });

  describe("getRecentEntries", () => {
    it("should return the most recent N entries", () => {
      const markdown = `# Conversation Summary: conv-123

## Metadata

**Total Messages:** 150
**Last Updated:** 2025-01-03T00:00:00Z

## Summary Log

### [2025-01-03T00:00:00Z] Third topic

Content: Third
Window Start: 101
Window End: 150

---

### [2025-01-02T00:00:00Z] Second topic

Content: Second
Window Start: 51
Window End: 100

---

### [2025-01-01T00:00:00Z] First topic

Content: First
Window Start: 1
Window End: 50

---

`;

      const entries = adapter.getRecentEntries(markdown, 2);
      
      expect(entries).toHaveLength(2);
      expect(entries[0]?.title).toBe("Third topic");
      expect(entries[1]?.title).toBe("Second topic");
    });

    it("should handle request for more entries than exist", () => {
      const markdown = `# Conversation Summary: conv-123

## Metadata

**Total Messages:** 50
**Last Updated:** 2025-01-01T00:00:00Z

## Summary Log

### [2025-01-01T00:00:00Z] Only entry

Content: Content
Window Start: 1
Window End: 50

---

`;

      const entries = adapter.getRecentEntries(markdown, 5);
      
      expect(entries).toHaveLength(1);
    });
  });

  describe("toMarkdown and fromMarkdown", () => {
    it("should convert entity to markdown", () => {
      const entity: SummaryEntity = {
        id: "summary-conv-123",
        entityType: "summary",
        content: "# Test Content",
        created: "2025-01-01T00:00:00Z",
        updated: "2025-01-01T00:00:00Z",
        metadata: {
          conversationId: "conv-123",
          entryCount: 1,
          totalMessages: 50,
          lastUpdated: "2025-01-01T00:00:00Z",
        },
      };

      const markdown = adapter.toMarkdown(entity);
      
      expect(markdown).toBe("# Test Content");
    });

    it("should create entity from markdown", () => {
      const markdown = `# Conversation Summary: conv-456

## Metadata

**Total Messages:** 75
**Last Updated:** 2025-01-02T00:00:00Z

## Summary Log

### [2025-01-02T00:00:00Z] Follow-up

## Content
More test

## Window Start
51

## Window End
75

---

### [2025-01-01T00:00:00Z] Initial

## Content
Test

## Window Start
1

## Window End
50

---

`;

      const entity = adapter.fromMarkdown(markdown);
      
      expect(entity.entityType).toBe("summary");
      expect(entity.content).toBe(markdown);
      expect(entity.created).toBe("2025-01-01T00:00:00Z");
      expect(entity.updated).toBe("2025-01-02T00:00:00Z");
      expect(entity.metadata?.conversationId).toBe("conv-456");
      expect(entity.metadata?.entryCount).toBe(2);
      expect(entity.metadata?.totalMessages).toBe(75);
    });
  });

  describe("extractMetadata", () => {
    it("should extract metadata from entity", () => {
      const entity: SummaryEntity = {
        id: "summary-conv-123",
        entityType: "summary",
        content: "content",
        created: "2025-01-01T00:00:00Z",
        updated: "2025-01-01T00:00:00Z",
        metadata: {
          conversationId: "conv-123",
          entryCount: 5,
          totalMessages: 250,
          lastUpdated: "2025-01-01T00:00:00Z",
        },
      };

      const metadata = adapter.extractMetadata(entity);
      
      expect(metadata).toEqual({
        conversationId: "conv-123",
        entryCount: 5,
        totalMessages: 250,
        lastUpdated: "2025-01-01T00:00:00Z",
      });
    });

    it("should return empty object if no metadata", () => {
      const entity: SummaryEntity = {
        id: "summary-conv-123",
        entityType: "summary",
        content: "content",
        created: "2025-01-01T00:00:00Z",
        updated: "2025-01-01T00:00:00Z",
      };

      const metadata = adapter.extractMetadata(entity);
      
      expect(metadata).toEqual({});
    });
  });

  describe("generateFrontMatter", () => {
    it("should return empty string as summaries don't use frontmatter", () => {
      const entity: SummaryEntity = {
        id: "summary-conv-123",
        entityType: "summary",
        content: "content",
        created: "2025-01-01T00:00:00Z",
        updated: "2025-01-01T00:00:00Z",
      };

      const frontmatter = adapter.generateFrontMatter(entity);
      
      expect(frontmatter).toBe("");
    });
  });

  describe("addOrUpdateEntry", () => {
    it("should create new summary when no existing content", () => {
      const newEntry: SummaryLogEntry = {
        title: "Initial discussion",
        content: "First conversation",
        created: "2025-01-01T00:00:00Z",
        updated: "2025-01-01T00:00:00Z",
        windowStart: 1,
        windowEnd: 50,
        keyPoints: ["Introduction"],
      };

      const result = adapter.addOrUpdateEntry(
        null,
        newEntry,
        "conv-123",
        false,
      );
      
      expect(result).toContain("# Conversation Summary: conv-123");
      expect(result).toContain("**Total Messages:** 50");
      expect(result).toContain("Initial discussion");
      expect(result).toContain("First conversation");
    });

    it("should prepend new entry to existing summary", () => {
      const existingContent = `# Conversation Summary: conv-123

## Metadata

**Total Messages:** 50
**Last Updated:** 2025-01-01T00:00:00Z

## Summary Log

### [2025-01-01T00:00:00Z] Old discussion

Content: Old content
Window Start: 1
Window End: 50

---

`;

      const newEntry: SummaryLogEntry = {
        title: "New discussion",
        content: "New content",
        created: "2025-01-02T00:00:00Z",
        updated: "2025-01-02T00:00:00Z",
        windowStart: 51,
        windowEnd: 100,
      };

      const result = adapter.addOrUpdateEntry(
        existingContent,
        newEntry,
        "conv-123",
        false,
      );
      
      expect(result).toContain("**Total Messages:** 100");
      expect(result).toContain("**Last Updated:** 2025-01-02T00:00:00Z");
      
      // New entry should appear before old entry
      const newIndex = result.indexOf("New discussion");
      const oldIndex = result.indexOf("Old discussion");
      expect(newIndex).toBeLessThan(oldIndex);
    });

    it("should update existing entry when shouldUpdate is true", () => {
      const existingContent = `# Conversation Summary: conv-123

## Metadata

**Total Messages:** 50
**Last Updated:** 2025-01-01T00:00:00Z

## Summary Log

### [2025-01-01T00:00:00Z] Discussion

## Content
Original content

## Window Start
1

## Window End
50

## Key Points

- Point 1

---

`;

      const newEntry: SummaryLogEntry = {
        title: "Discussion",
        content: "Additional content",
        created: "2025-01-01T12:00:00Z",
        updated: "2025-01-01T12:00:00Z",
        windowStart: 51,
        windowEnd: 100,
        keyPoints: ["Point 2"],
      };

      const result = adapter.addOrUpdateEntry(
        existingContent,
        newEntry,
        "conv-123",
        true,
        0, // Update the first (most recent) entry
      );
      
      expect(result).toContain("UPDATE: Additional content");
      expect(result).toContain("Updated 2025-01-01T12:00:00Z");
      expect(result).toContain("## Window End\n100");
      expect(result).toContain("- Point 1");
      expect(result).toContain("- Point 2");
    });

    it("should merge participants without duplicates when updating", () => {
      const existingContent = `# Conversation Summary: conv-123

## Metadata

**Total Messages:** 50
**Last Updated:** 2025-01-01T00:00:00Z

## Summary Log

### [2025-01-01T00:00:00Z] Discussion

## Content
Original

## Window Start
1

## Window End
50

## Participants

- user-1
- assistant

---

`;

      const newEntry: SummaryLogEntry = {
        title: "Discussion",
        content: "More",
        created: "2025-01-01T12:00:00Z",
        updated: "2025-01-01T12:00:00Z",
        windowStart: 51,
        windowEnd: 100,
        participants: ["user-1", "user-2"],
      };

      const result = adapter.addOrUpdateEntry(
        existingContent,
        newEntry,
        "conv-123",
        true,
        0,
      );
      
      const body = adapter.parseSummaryContent(result);
      expect(body.entries[0]?.participants).toContain("user-1");
      expect(body.entries[0]?.participants).toContain("user-2");
      expect(body.entries[0]?.participants).toContain("assistant");
      expect(body.entries[0]?.participants).toHaveLength(3);
    });

    it("should add new entry when shouldUpdate is true but index doesn't exist", () => {
      const existingContent = `# Conversation Summary: conv-123

## Metadata

**Total Messages:** 50
**Last Updated:** 2025-01-01T00:00:00Z

## Summary Log

### [2025-01-01T00:00:00Z] Only entry

Content: Content
Window Start: 1
Window End: 50

---

`;

      const newEntry: SummaryLogEntry = {
        title: "New topic",
        content: "New content",
        created: "2025-01-02T00:00:00Z",
        updated: "2025-01-02T00:00:00Z",
        windowStart: 51,
        windowEnd: 100,
      };

      const result = adapter.addOrUpdateEntry(
        existingContent,
        newEntry,
        "conv-123",
        true,
        5, // Index that doesn't exist
      );
      
      // Should prepend as new entry since index doesn't exist
      const body = adapter.parseSummaryContent(result);
      expect(body.entries).toHaveLength(2);
      expect(body.entries[0]?.title).toBe("New topic");
    });
  });
});
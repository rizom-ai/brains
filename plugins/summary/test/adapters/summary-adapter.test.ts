import { describe, it, expect, beforeEach } from "bun:test";
import { SummaryAdapter } from "../../src/adapters/summary-adapter";
import type { SummaryEntity, SummaryBody } from "../../src/schemas/summary";

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
      const body: SummaryBody = {
        conversationId: "conv-123",
        entries: [
          {
            title: "Initial discussion",
            content: "User asked about project setup and we discussed TypeScript configuration.",
            created: "2025-01-01T00:00:00Z",
            updated: "2025-01-01T00:00:00Z",
          },
        ],
        totalMessages: 50,
        lastUpdated: "2025-01-01T00:00:00Z",
      };

      const content = adapter.createSummaryContent(body);

      expect(content).toContain("# Conversation Summary: conv-123");
      expect(content).toContain("**Total Messages:** 50");
      expect(content).toContain("**Last Updated:** 2025-01-01T00:00:00Z");
      expect(content).toContain(
        "### [2025-01-01T00:00:00Z] Initial discussion",
      );
      expect(content).toContain("User asked about project setup");
    });

    it("should handle multiple entries in reverse chronological order", () => {
      const body: SummaryBody = {
        conversationId: "conv-123",
        entries: [
          {
            title: "Recent topic",
            content: "Latest discussion about deployment strategies.",
            created: "2025-01-02T00:00:00Z",
            updated: "2025-01-02T00:00:00Z",
          },
          {
            title: "Initial topic",
            content: "Initial project setup discussion.",
            created: "2025-01-01T00:00:00Z",
            updated: "2025-01-01T00:00:00Z",
          },
        ],
        totalMessages: 100,
        lastUpdated: "2025-01-02T00:00:00Z",
      };

      const content = adapter.createSummaryContent(body);
      
      // Check entries appear in order (newest first)
      const recentIndex = content.indexOf("Recent topic");
      const initialIndex = content.indexOf("Initial topic");
      expect(recentIndex).toBeLessThan(initialIndex);
      expect(content).toContain("deployment strategies");
    });

    it("should show updated timestamp when entry is updated", () => {
      const body: SummaryBody = {
        conversationId: "conv-123",
        entries: [
          {
            title: "Discussion",
            content: "Original content with updates.",
            created: "2025-01-01T00:00:00Z",
            updated: "2025-01-01T12:00:00Z",
          },
        ],
        totalMessages: 50,
        lastUpdated: "2025-01-01T12:00:00Z",
      };

      const content = adapter.createSummaryContent(body);
      expect(content).toContain(
        "### [2025-01-01T00:00:00Z - Updated 2025-01-01T12:00:00Z] Discussion",
      );
    });

    it("should handle empty entries array", () => {
      const body: SummaryBody = {
        conversationId: "conv-123",
        entries: [],
        totalMessages: 0,
        lastUpdated: "2025-01-01T00:00:00Z",
      };

      const content = adapter.createSummaryContent(body);
      expect(content).toContain("# Conversation Summary: conv-123");
      expect(content).toContain("**Total Messages:** 0");
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

User asked about project setup and TypeScript configuration.

---

`;

      const body = adapter.parseSummaryContent(markdown);

      expect(body.conversationId).toBe("conv-123");
      expect(body.totalMessages).toBe(50);
      expect(body.lastUpdated).toBe("2025-01-01T00:00:00Z");
      expect(body.entries).toHaveLength(1);
      expect(body.entries[0]?.title).toBe("Initial discussion");
      expect(body.entries[0]?.content).toContain("project setup");
      expect(body.entries[0]?.created).toBe("2025-01-01T00:00:00Z");
      expect(body.entries[0]?.updated).toBe("2025-01-01T00:00:00Z");
    });

    it("should parse multiple entries", () => {
      const markdown = `# Conversation Summary: conv-123

## Metadata

**Total Messages:** 100
**Last Updated:** 2025-01-02T00:00:00Z

## Summary Log

### [2025-01-02T00:00:00Z] Recent topic

Latest discussion about deployment.

---

### [2025-01-01T00:00:00Z] Initial topic

Initial setup discussion.

---

`;

      const body = adapter.parseSummaryContent(markdown);

      expect(body.entries).toHaveLength(2);
      expect(body.entries[0]?.title).toBe("Recent topic");
      expect(body.entries[1]?.title).toBe("Initial topic");
    });

    it("should handle updated entries", () => {
      const markdown = `# Conversation Summary: conv-123

## Metadata

**Total Messages:** 50
**Last Updated:** 2025-01-01T12:00:00Z

## Summary Log

### [2025-01-01T00:00:00Z - Updated 2025-01-01T12:00:00Z] Discussion

Content with updates.

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
    });

    it("should handle missing metadata gracefully", () => {
      const markdown = `# Conversation Summary: conv-123

## Summary Log

### [2025-01-01T00:00:00Z] Entry

Content

---

`;

      const body = adapter.parseSummaryContent(markdown);

      expect(body.conversationId).toBe("conv-123");
      expect(body.totalMessages).toBe(0);
      expect(body.entries).toHaveLength(1);
    });
  });

  describe("getRecentEntries", () => {
    it("should return the most recent N entries", () => {
      const markdown = `# Conversation Summary: conv-123

## Metadata

**Total Messages:** 100
**Last Updated:** 2025-01-02T00:00:00Z

## Summary Log

### [2025-01-02T00:00:00Z] Entry 2

Content 2

---

### [2025-01-01T00:00:00Z] Entry 1

Content 1

---

`;

      const entries = adapter.getRecentEntries(markdown, 1);

      expect(entries).toHaveLength(1);
      expect(entries[0]?.title).toBe("Entry 2");
    });

    it("should handle request for more entries than exist", () => {
      const markdown = `# Conversation Summary: conv-123

## Metadata

**Total Messages:** 50
**Last Updated:** 2025-01-01T00:00:00Z

## Summary Log

### [2025-01-01T00:00:00Z] Entry

Content

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
        content: "# Test content",
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
      expect(markdown).toBe("# Test content");
    });

    it("should create entity from markdown", () => {
      const markdown = `# Conversation Summary: conv-123

## Metadata

**Total Messages:** 50
**Last Updated:** 2025-01-01T00:00:00Z

## Summary Log

### [2025-01-01T00:00:00Z] Entry

Content

---

`;

      const entity = adapter.fromMarkdown(markdown);

      expect(entity.entityType).toBe("summary");
      expect(entity.content).toBe(markdown);
      expect(entity.created).toBe("2025-01-01T00:00:00Z");
      expect(entity.metadata?.conversationId).toBe("conv-123");
      expect(entity.metadata?.entryCount).toBe(1);
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
          entryCount: 1,
          totalMessages: 50,
          lastUpdated: "2025-01-01T00:00:00Z",
        },
      };

      const metadata = adapter.extractMetadata(entity);
      expect(metadata["conversationId"]).toBe("conv-123");
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
      const newEntry = {
        title: "Initial discussion",
        content: "First conversation about the project.",
        created: "2025-01-01T00:00:00Z",
        updated: "2025-01-01T00:00:00Z",
      };

      const result = adapter.addOrUpdateEntry(
        null,
        newEntry,
        "conv-123",
        false,
      );

      expect(result).toContain("# Conversation Summary: conv-123");
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

Old content

---

`;

      const newEntry = {
        title: "New discussion",
        content: "New content about recent topics.",
        created: "2025-01-02T00:00:00Z",
        updated: "2025-01-02T00:00:00Z",
      };

      const result = adapter.addOrUpdateEntry(
        existingContent,
        newEntry,
        "conv-123",
        false,
      );

      // New entry should appear first
      const newIndex = result.indexOf("New discussion");
      const oldIndex = result.indexOf("Old discussion");
      expect(newIndex).toBeLessThan(oldIndex);
      expect(result).toContain("New content about recent topics");
    });

    it("should update existing entry when shouldUpdate is true", () => {
      const existingContent = `# Conversation Summary: conv-123

## Metadata

**Total Messages:** 50
**Last Updated:** 2025-01-01T00:00:00Z

## Summary Log

### [2025-01-01T00:00:00Z] Discussion

Original content

---

`;

      const updateEntry = {
        title: "Discussion",
        content: "Additional content",
        created: "2025-01-01T12:00:00Z",
        updated: "2025-01-01T12:00:00Z",
      };

      const result = adapter.addOrUpdateEntry(
        existingContent,
        updateEntry,
        "conv-123",
        true,
        0, // Update the first (most recent) entry
      );

      expect(result).toContain("Original content\n\nUPDATE: Additional content");
      expect(result).toContain("Updated 2025-01-01T12:00:00Z");
    });

    it("should add new entry when shouldUpdate is true but index doesn't exist", () => {
      const existingContent = `# Conversation Summary: conv-123

## Metadata

**Total Messages:** 50
**Last Updated:** 2025-01-01T00:00:00Z

## Summary Log

### [2025-01-01T00:00:00Z] Entry

Content

---

`;

      const newEntry = {
        title: "New entry",
        content: "New content",
        created: "2025-01-02T00:00:00Z",
        updated: "2025-01-02T00:00:00Z",
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
      expect(body.entries[0]?.title).toBe("New entry");
    });
  });
});
import { describe, it, expect, beforeEach } from "bun:test";
import { SummaryAdapter } from "../../src/adapters/summary-adapter";
import type { SummaryLogEntry } from "../../src/schemas/summary";
import { createMockSummaryEntity } from "../fixtures/summary-entities";

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

  describe("createContentBody", () => {
    it("should create markdown body from entries", () => {
      const entries: SummaryLogEntry[] = [
        {
          title: "Initial discussion",
          content:
            "User asked about project setup and we discussed TypeScript configuration.",
          created: "2025-01-01T00:00:00Z",
          updated: "2025-01-01T00:00:00Z",
        },
      ];

      const content = adapter.createContentBody(entries);

      expect(content).toContain("# Summary Log");
      expect(content).toContain(
        "### [2025-01-01T00:00:00Z] Initial discussion",
      );
      expect(content).toContain("User asked about project setup");
      expect(content).not.toContain("Total Messages");
      expect(content).not.toContain("Conversation Summary");
    });

    it("should handle multiple entries in order", () => {
      const entries: SummaryLogEntry[] = [
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
      ];

      const content = adapter.createContentBody(entries);

      // Check entries appear in order (newest first)
      const recentIndex = content.indexOf("Recent topic");
      const initialIndex = content.indexOf("Initial topic");
      expect(recentIndex).toBeLessThan(initialIndex);
      expect(content).toContain("deployment strategies");
    });

    it("should show updated timestamp when entry is updated", () => {
      const entries: SummaryLogEntry[] = [
        {
          title: "Discussion",
          content: "Original content with updates.",
          created: "2025-01-01T00:00:00Z",
          updated: "2025-01-01T12:00:00Z",
        },
      ];

      const content = adapter.createContentBody(entries);
      expect(content).toContain(
        "### [2025-01-01T00:00:00Z - Updated 2025-01-01T12:00:00Z] Discussion",
      );
    });

    it("should handle empty entries array", () => {
      const entries: SummaryLogEntry[] = [];

      const content = adapter.createContentBody(entries);
      expect(content).toContain("# Summary Log");
      expect(content).not.toContain("###");
    });
  });

  describe("parseEntriesFromContent", () => {
    it("should parse entries from markdown body", () => {
      const markdown = `# Summary Log

### [2025-01-01T00:00:00Z] Initial discussion

User asked about project setup and TypeScript configuration.

---

`;

      const entries = adapter.parseEntriesFromContent(markdown);

      expect(entries).toHaveLength(1);
      expect(entries[0]?.title).toBe("Initial discussion");
      expect(entries[0]?.content).toContain("project setup");
      expect(entries[0]?.created).toBe("2025-01-01T00:00:00Z");
      expect(entries[0]?.updated).toBe("2025-01-01T00:00:00Z");
    });

    it("should parse multiple entries", () => {
      const markdown = `# Summary Log

### [2025-01-02T00:00:00Z] Recent topic

Latest discussion about deployment.

---

### [2025-01-01T00:00:00Z] Initial topic

Initial setup discussion.

---

`;

      const entries = adapter.parseEntriesFromContent(markdown);

      expect(entries).toHaveLength(2);
      expect(entries[0]?.title).toBe("Recent topic");
      expect(entries[1]?.title).toBe("Initial topic");
    });

    it("should handle updated entries", () => {
      const markdown = `# Summary Log

### [2025-01-01T00:00:00Z - Updated 2025-01-01T12:00:00Z] Discussion

Content with updates.

---

`;

      const entries = adapter.parseEntriesFromContent(markdown);

      expect(entries).toHaveLength(1);
      expect(entries[0]?.created).toBe("2025-01-01T00:00:00Z");
      expect(entries[0]?.updated).toBe("2025-01-01T12:00:00Z");
    });

    it("should handle empty summary log", () => {
      const markdown = `# Summary Log

`;

      const entries = adapter.parseEntriesFromContent(markdown);

      expect(entries).toHaveLength(0);
    });

    it("should handle entries without header", () => {
      const markdown = `### [2025-01-01T00:00:00Z] Entry

Content

---

`;

      const entries = adapter.parseEntriesFromContent(markdown);

      expect(entries).toHaveLength(1);
      expect(entries[0]?.title).toBe("Entry");
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
    it("should convert entity to markdown with frontmatter", () => {
      const entity = createMockSummaryEntity({
        id: "conv-123",
        content:
          "# Summary Log\n\n### [2025-01-01T00:00:00Z] Test\n\nContent\n\n---\n",
        metadata: {
          conversationId: "conv-123",
          channelName: "Test Channel",
          channelId: "test-channel",
          interfaceType: "cli",
          entryCount: 1,
          totalMessages: 50,
        },
      });

      const markdown = adapter.toMarkdown(entity);
      expect(markdown).toContain("---\nconversationId: conv-123");
      expect(markdown).toContain("channelName: Test Channel");
      expect(markdown).toContain("# Summary Log");
    });

    it("should create entity from markdown with frontmatter", () => {
      const markdown = `---
conversationId: conv-123
channelName: Test Channel
channelId: test-channel
interfaceType: cli
totalMessages: 50
entryCount: 1
---
# Summary Log

### [2025-01-01T00:00:00Z] Entry

Content

---

`;

      const entity = adapter.fromMarkdown(markdown);

      expect(entity.entityType).toBe("summary");
      expect(entity.content).toBe(markdown);
      expect(entity.created).toBe("2025-01-01T00:00:00Z");
      expect(entity.metadata?.conversationId).toBe("conv-123");
      expect(entity.metadata?.channelName).toBe("Test Channel");
      expect(entity.metadata?.entryCount).toBe(1);
    });
  });

  describe("extractMetadata", () => {
    it("should extract metadata from entity", () => {
      const entity = createMockSummaryEntity({
        id: "conv-123",
        content: "content",
        metadata: {
          conversationId: "conv-123",
          channelName: "Test Channel",
          channelId: "test-channel",
          interfaceType: "cli",
          entryCount: 1,
          totalMessages: 50,
        },
      });

      const metadata = adapter.extractMetadata(entity);
      expect(metadata["conversationId"]).toBe("conv-123");
    });
  });

  describe("generateFrontMatter", () => {
    it("should generate frontmatter with metadata", () => {
      const entity = createMockSummaryEntity({
        id: "conv-123",
        content: "content",
        metadata: {
          conversationId: "conv-123",
          channelName: "Test Channel",
          channelId: "test-channel",
          interfaceType: "cli",
          entryCount: 1,
          totalMessages: 10,
        },
      });

      const frontmatter = adapter.generateFrontMatter(entity);
      expect(frontmatter).toContain("conversationId: conv-123");
      expect(frontmatter).toContain("channelName: Test Channel");
    });
  });

  describe("manageEntries", () => {
    it("should add new entry to empty list", () => {
      const newEntry: SummaryLogEntry = {
        title: "Initial discussion",
        content: "First conversation about the project.",
        created: "2025-01-01T00:00:00Z",
        updated: "2025-01-01T00:00:00Z",
      };

      const result = adapter.manageEntries([], newEntry, false);

      expect(result).toHaveLength(1);
      expect(result[0]?.title).toBe("Initial discussion");
      expect(result[0]?.content).toContain("First conversation");
    });

    it("should prepend new entry to existing list", () => {
      const existingEntries: SummaryLogEntry[] = [
        {
          title: "Old discussion",
          content: "Old content",
          created: "2025-01-01T00:00:00Z",
          updated: "2025-01-01T00:00:00Z",
        },
      ];

      const newEntry: SummaryLogEntry = {
        title: "New discussion",
        content: "New content about recent topics.",
        created: "2025-01-02T00:00:00Z",
        updated: "2025-01-02T00:00:00Z",
      };

      const result = adapter.manageEntries(existingEntries, newEntry, false);

      expect(result).toHaveLength(2);
      expect(result[0]?.title).toBe("New discussion");
      expect(result[1]?.title).toBe("Old discussion");
    });

    it("should update existing entry when shouldUpdate is true", () => {
      const existingEntries: SummaryLogEntry[] = [
        {
          title: "Discussion",
          content: "Original content",
          created: "2025-01-01T00:00:00Z",
          updated: "2025-01-01T00:00:00Z",
        },
      ];

      const updateEntry: SummaryLogEntry = {
        title: "Discussion",
        content: "Additional content",
        created: "2025-01-01T12:00:00Z",
        updated: "2025-01-01T12:00:00Z",
      };

      const result = adapter.manageEntries(
        existingEntries,
        updateEntry,
        true,
        0, // Update the first (most recent) entry
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.content).toBe(
        "Original content\n\nUPDATE: Additional content",
      );
      expect(result[0]?.updated).toBe("2025-01-01T12:00:00Z");
    });

    it("should add new entry when shouldUpdate is true but index doesn't exist", () => {
      const existingEntries: SummaryLogEntry[] = [
        {
          title: "Entry",
          content: "Content",
          created: "2025-01-01T00:00:00Z",
          updated: "2025-01-01T00:00:00Z",
        },
      ];

      const newEntry: SummaryLogEntry = {
        title: "New entry",
        content: "New content",
        created: "2025-01-02T00:00:00Z",
        updated: "2025-01-02T00:00:00Z",
      };

      const result = adapter.manageEntries(
        existingEntries,
        newEntry,
        true,
        5, // Index that doesn't exist
      );

      // Should prepend as new entry since index doesn't exist
      expect(result).toHaveLength(2);
      expect(result[0]?.title).toBe("New entry");
      expect(result[1]?.title).toBe("Entry");
    });
  });
});

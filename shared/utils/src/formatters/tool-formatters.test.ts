import { describe, it, expect } from "bun:test";
import {
  formatAsList,
  formatAsTable,
  formatAsEntity,
  formatAsSearchResults,
} from "./tool-formatters";

describe("Tool Formatters", () => {
  describe("formatAsList", () => {
    it("should format items as a bullet list", () => {
      const items = [
        { name: "Alice", role: "Developer" },
        { name: "Bob", role: "Designer" },
      ];

      const result = formatAsList(items, {
        title: (item) => item.name,
        subtitle: (item) => item.role,
      });

      expect(result).toContain("- **Alice**: Developer");
      expect(result).toContain("- **Bob**: Designer");
    });

    it("should format items as numbered list when specified", () => {
      const items = [{ name: "First" }, { name: "Second" }];

      const result = formatAsList(items, {
        title: (item) => item.name,
        numbered: true,
      });

      expect(result).toContain("1. First");
      expect(result).toContain("2. Second");
    });

    it("should include header when provided", () => {
      const items = [{ name: "Item" }];

      const result = formatAsList(items, {
        title: (item) => item.name,
        header: "## My List",
      });

      expect(result).toContain("## My List");
    });

    it("should handle empty array", () => {
      const result = formatAsList([], {
        title: (item: { name: string }) => item.name,
      });

      expect(result).toContain("No items");
    });

    it("should truncate with maxItems", () => {
      const items = [
        { name: "One" },
        { name: "Two" },
        { name: "Three" },
        { name: "Four" },
      ];

      const result = formatAsList(items, {
        title: (item) => item.name,
        maxItems: 2,
      });

      expect(result).toContain("- One");
      expect(result).toContain("- Two");
      expect(result).not.toContain("- Three");
      expect(result).toContain("and 2 more");
    });
  });

  describe("formatAsTable", () => {
    it("should format items as markdown table", () => {
      const items = [
        { name: "Alice", age: 30 },
        { name: "Bob", age: 25 },
      ];

      const result = formatAsTable(items, {
        columns: [
          { header: "Name", value: (item) => item.name },
          { header: "Age", value: (item) => item.age },
        ],
      });

      expect(result).toContain("| Name | Age |");
      expect(result).toContain("| --- | --- |");
      expect(result).toContain("| Alice | 30 |");
      expect(result).toContain("| Bob | 25 |");
    });

    it("should handle column alignment", () => {
      const items = [{ value: 100 }];

      const result = formatAsTable(items, {
        columns: [
          { header: "Left", value: () => "L", align: "left" },
          { header: "Center", value: () => "C", align: "center" },
          { header: "Right", value: () => "R", align: "right" },
        ],
      });

      expect(result).toContain("| --- | :---: | ---: |");
    });

    it("should handle empty array", () => {
      const result = formatAsTable([], {
        columns: [
          { header: "Name", value: (item: { name: string }) => item.name },
        ],
      });

      expect(result).toContain("No items");
    });

    it("should truncate with maxRows", () => {
      const items = [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }];

      const result = formatAsTable(items, {
        columns: [{ header: "N", value: (item) => item.n }],
        maxRows: 2,
      });

      expect(result).toContain("| 1 |");
      expect(result).toContain("| 2 |");
      expect(result).not.toContain("| 3 |");
      expect(result).toContain("and 2 more rows");
    });
  });

  describe("formatAsEntity", () => {
    it("should format object as key-value pairs", () => {
      const entity = {
        name: "Test Entity",
        status: "active",
        count: 42,
      };

      const result = formatAsEntity(entity);

      expect(result).toContain("**Name**: Test Entity");
      expect(result).toContain("**Status**: active");
      expect(result).toContain("**Count**: 42");
    });

    it("should include title when provided", () => {
      const entity = { name: "Test" };

      const result = formatAsEntity(entity, { title: "Entity Details" });

      expect(result).toContain("## Entity Details");
    });

    it("should exclude specified fields", () => {
      const entity = {
        name: "Test",
        secret: "hidden",
        internal: "private",
      };

      const result = formatAsEntity(entity, {
        excludeFields: ["secret", "internal"],
      });

      expect(result).toContain("**Name**: Test");
      expect(result).not.toContain("secret");
      expect(result).not.toContain("hidden");
    });

    it("should handle boolean values", () => {
      const entity = { enabled: true, disabled: false };

      const result = formatAsEntity(entity);

      expect(result).toContain("**Enabled**: Yes");
      expect(result).toContain("**Disabled**: No");
    });

    it("should handle null/undefined values", () => {
      const entity = { value: null, other: undefined };

      const result = formatAsEntity(entity as Record<string, unknown>);

      expect(result).toContain("_none_");
    });
  });

  describe("formatAsSearchResults", () => {
    it("should format search results", () => {
      const results = [
        { id: "1", title: "First Result", snippet: "Some text..." },
        { id: "2", title: "Second Result", entityType: "note" },
      ];

      const result = formatAsSearchResults(results);

      expect(result).toContain("**First Result**");
      expect(result).toContain("Some text...");
      expect(result).toContain("**Second Result** (note)");
    });

    it("should include query in header", () => {
      const results = [{ id: "1", title: "Result" }];

      const result = formatAsSearchResults(results, { query: "test query" });

      expect(result).toContain('Search Results for "test query"');
    });

    it("should show scores when enabled", () => {
      const results = [{ id: "1", title: "Result", score: 0.95 }];

      const result = formatAsSearchResults(results, { showScores: true });

      expect(result).toContain("[95%]");
    });

    it("should handle empty results", () => {
      const result = formatAsSearchResults([]);

      expect(result).toContain("No results found");
    });

    it("should truncate with maxResults", () => {
      const results = [
        { id: "1", title: "One" },
        { id: "2", title: "Two" },
        { id: "3", title: "Three" },
      ];

      const result = formatAsSearchResults(results, { maxResults: 2 });

      expect(result).toContain("**One**");
      expect(result).toContain("**Two**");
      expect(result).not.toContain("**Three**");
      expect(result).toContain("and 1 more results");
    });
  });
});

import { describe, it, expect } from "bun:test";
import { z } from "zod";
import { StructuredContentFormatter } from "./structured-content";
import type { FieldMapping } from "./structured-content";

describe("StructuredContentFormatter", () => {
  // Simple flat schema for basic tests
  const simpleSchema = z.object({
    title: z.string(),
    description: z.string(),
    count: z.number(),
  });

  type SimpleData = z.infer<typeof simpleSchema>;

  const simpleMappings: FieldMapping[] = [
    { key: "title", label: "Title", type: "string" },
    { key: "description", label: "Description", type: "string" },
    { key: "count", label: "Count", type: "number" },
  ];

  // Nested schema for complex tests
  const nestedSchema = z.object({
    name: z.string(),
    metadata: z.object({
      author: z.string(),
      version: z.string(),
      tags: z.array(z.string()),
    }),
  });

  type NestedData = z.infer<typeof nestedSchema>;

  const nestedMappings: FieldMapping[] = [
    { key: "name", label: "Name", type: "string" },
    {
      key: "metadata",
      label: "Metadata",
      type: "object",
      children: [
        { key: "author", label: "Author", type: "string" },
        { key: "version", label: "Version", type: "string" },
        { key: "tags", label: "Tags", type: "array" },
      ],
    },
  ];

  describe("simple schema", () => {
    const formatter = new StructuredContentFormatter(simpleSchema, {
      title: "Simple Configuration",
      mappings: simpleMappings,
    });

    it("should format simple data correctly", () => {
      const data: SimpleData = {
        title: "Test Title",
        description: "This is a test description",
        count: 42,
      };

      const result = formatter.format(data);

      expect(result).toBe(`# Simple Configuration

## Title
Test Title

## Description
This is a test description

## Count
42
`);
    });

    it("should parse formatted content back to data", () => {
      const markdown = `# Simple Configuration

## Title
My Title

## Description
A longer description
with multiple lines

## Count
123
`;

      const result = formatter.parse(markdown);

      expect(result).toEqual({
        title: "My Title",
        description: "A longer description\nwith multiple lines",
        count: 123,
      });
    });

    it("should handle roundtrip conversion", () => {
      const data: SimpleData = {
        title: "Roundtrip Test",
        description: "Testing roundtrip conversion",
        count: 999,
      };

      const formatted = formatter.format(data);
      const parsed = formatter.parse(formatted);

      expect(parsed).toEqual(data);
    });
  });

  describe("nested schema", () => {
    const formatter = new StructuredContentFormatter(nestedSchema, {
      title: "Nested Configuration",
      mappings: nestedMappings,
    });

    it("should format nested data correctly", () => {
      const data: NestedData = {
        name: "Test Project",
        metadata: {
          author: "John Doe",
          version: "1.0.0",
          tags: ["test", "example", "demo"],
        },
      };

      const result = formatter.format(data);

      expect(result).toBe(`# Nested Configuration

## Name
Test Project

## Metadata
### Author
John Doe

### Version
1.0.0

### Tags

- test
- example
- demo
`);
    });

    it("should parse nested content back to data", () => {
      const markdown = `# Nested Configuration

## Name
My Project

## Metadata
### Author
Jane Smith

### Version
2.1.0

### Tags

- production
- stable
`;

      const result = formatter.parse(markdown);

      expect(result).toEqual({
        name: "My Project",
        metadata: {
          author: "Jane Smith",
          version: "2.1.0",
          tags: ["production", "stable"],
        },
      });
    });
  });

  describe("array handling", () => {
    const schema = z.object({
      items: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
        }),
      ),
    });

    it("should format arrays of objects with structure", () => {
      const formatter = new StructuredContentFormatter(schema, {
        title: "Array Test",
        mappings: [
          {
            key: "items",
            label: "Items",
            type: "array",
            itemType: "object",
            itemMappings: [
              { key: "id", label: "ID", type: "string" },
              { key: "name", label: "Name", type: "string" },
            ],
          },
        ],
      });

      const data = {
        items: [
          { id: "001", name: "First Item" },
          { id: "002", name: "Second Item" },
        ],
      };

      const result = formatter.format(data);

      expect(result).toContain("### Item 1");
      expect(result).toContain("#### ID\n001");
      expect(result).toContain("#### Name\nFirst Item");
      expect(result).toContain("### Item 2");
      expect(result).toContain("#### ID\n002");
      expect(result).toContain("#### Name\nSecond Item");
    });

    it("should use default formatter for simple arrays", () => {
      const simpleSchema = z.object({
        tags: z.array(z.string()),
      });

      const formatter = new StructuredContentFormatter(simpleSchema, {
        title: "Simple Array",
        mappings: [{ key: "tags", label: "Tags", type: "array" }],
      });

      const data = { tags: ["one", "two", "three"] };
      const result = formatter.format(data);

      expect(result).toContain("- one");
      expect(result).toContain("- two");
      expect(result).toContain("- three");
    });
  });

  describe("error handling", () => {
    const formatter = new StructuredContentFormatter(simpleSchema, {
      title: "Test",
      mappings: simpleMappings,
    });

    it("should throw error for invalid schema on parse", () => {
      const invalidMarkdown = `# Test

## Title


## Description
Test

## Count
not-a-number
`;

      expect(() => formatter.parse(invalidMarkdown)).toThrow();
    });

    it("should handle missing fields gracefully", () => {
      const data = {
        title: "Test",
        description: "Desc",
        count: 0,
      };

      const result = formatter.format(data);
      expect(result).toContain("Test");
      expect(result).toContain("Desc");
      expect(result).toContain("0");
    });
  });

  describe("multiline content", () => {
    const schema = z.object({
      content: z.string(),
    });

    const formatter = new StructuredContentFormatter(schema, {
      title: "Multiline Test",
      mappings: [{ key: "content", label: "Content", type: "string" }],
    });

    it("should preserve multiline strings", () => {
      const data = {
        content: "Line 1\nLine 2\nLine 3",
      };

      const formatted = formatter.format(data);
      const parsed = formatter.parse(formatted);

      expect(parsed.content).toBe("Line 1\nLine 2\nLine 3");
    });
  });
});

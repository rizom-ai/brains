import { describe, it, expect } from "bun:test";
import {
  SourceListFormatter,
  sourceReferenceSchema,
  type SourceReference,
} from "./entity-field-formatters";

describe("sourceReferenceSchema", () => {
  it("should require entityId field", () => {
    const sourceWithoutEntityId = {
      slug: "test-post",
      title: "Test Post",
      type: "post",
      contentHash: "abc123",
    };

    const result = sourceReferenceSchema.safeParse(sourceWithoutEntityId);
    expect(result.success).toBe(false);
  });

  it("should require contentHash field", () => {
    const sourceWithoutHash = {
      slug: "test-post",
      title: "Test Post",
      type: "post",
      entityId: "post-123",
    };

    const result = sourceReferenceSchema.safeParse(sourceWithoutHash);
    expect(result.success).toBe(false);
  });

  it("should validate complete source with all fields", () => {
    const completeSource = {
      slug: "test-post",
      title: "Test Post",
      type: "post",
      entityId: "post-123",
      contentHash: "abc123def456",
    };

    const result = sourceReferenceSchema.safeParse(completeSource);
    expect(result.success).toBe(true);
  });
});

describe("SourceListFormatter", () => {
  describe("format", () => {
    it("should format sources with entityId and contentHash", () => {
      const sources: SourceReference[] = [
        {
          slug: "my-post",
          title: "My Post",
          type: "post",
          entityId: "post-123",
          contentHash: "hash456",
        },
      ];

      const result = SourceListFormatter.format(sources);

      expect(result).toBe("- My Post (my-post) [post] <post-123|hash456>");
    });

    it("should format multiple sources", () => {
      const sources: SourceReference[] = [
        {
          slug: "post-1",
          title: "First Post",
          type: "post",
          entityId: "id-1",
          contentHash: "hash-1",
        },
        {
          slug: "link-2",
          title: "Second Link",
          type: "link",
          entityId: "id-2",
          contentHash: "hash-2",
        },
      ];

      const result = SourceListFormatter.format(sources);

      expect(result).toBe(
        "- First Post (post-1) [post] <id-1|hash-1>\n- Second Link (link-2) [link] <id-2|hash-2>",
      );
    });

    it("should return empty string for empty sources", () => {
      const result = SourceListFormatter.format([]);
      expect(result).toBe("");
    });
  });

  describe("parse", () => {
    it("should parse source with entityId and contentHash", () => {
      const text = "- My Post (my-post) [post] <post-123|hash456>";

      const result = SourceListFormatter.parse(text);

      expect(result).toEqual([
        {
          slug: "my-post",
          title: "My Post",
          type: "post",
          entityId: "post-123",
          contentHash: "hash456",
        },
      ]);
    });

    it("should parse multiple sources", () => {
      const text =
        "- First Post (post-1) [post] <id-1|hash-1>\n- Second Link (link-2) [link] <id-2|hash-2>";

      const result = SourceListFormatter.parse(text);

      expect(result).toEqual([
        {
          slug: "post-1",
          title: "First Post",
          type: "post",
          entityId: "id-1",
          contentHash: "hash-1",
        },
        {
          slug: "link-2",
          title: "Second Link",
          type: "link",
          entityId: "id-2",
          contentHash: "hash-2",
        },
      ]);
    });

    it("should return empty array for empty text", () => {
      expect(SourceListFormatter.parse("")).toEqual([]);
      expect(SourceListFormatter.parse("   ")).toEqual([]);
    });

    it("should skip malformed lines", () => {
      const text =
        "- Valid Post (slug) [type] <id|hash>\n- Invalid line without format\n- Another Valid (slug2) [type2] <id2|hash2>";

      const result = SourceListFormatter.parse(text);

      expect(result).toHaveLength(2);
      expect(result[0]?.slug).toBe("slug");
      expect(result[1]?.slug).toBe("slug2");
    });
  });

  describe("roundtrip", () => {
    it("should maintain data integrity through format and parse", () => {
      const sources: SourceReference[] = [
        {
          slug: "ecosystem-architecture",
          title: "Ecosystem Architecture",
          type: "post",
          entityId: "post-abc123",
          contentHash: "sha256-def456",
        },
        {
          slug: "design-patterns",
          title: "Design Patterns in TypeScript",
          type: "link",
          entityId: "link-xyz789",
          contentHash: "sha256-ghi012",
        },
      ];

      const formatted = SourceListFormatter.format(sources);
      const parsed = SourceListFormatter.parse(formatted);

      expect(parsed).toEqual(sources);
    });
  });
});

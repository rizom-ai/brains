import { describe, it, expect } from "bun:test";
import { sortByPublicationDate } from "./sort";

describe("sortByPublicationDate", () => {
  it("should sort by publishedAt date, newest first", () => {
    const entities = [
      {
        id: "old",
        created: "2024-01-01T00:00:00Z",
        metadata: { publishedAt: "2024-01-15T00:00:00Z" },
      },
      {
        id: "new",
        created: "2024-01-01T00:00:00Z",
        metadata: { publishedAt: "2024-02-15T00:00:00Z" },
      },
      {
        id: "mid",
        created: "2024-01-01T00:00:00Z",
        metadata: { publishedAt: "2024-02-01T00:00:00Z" },
      },
    ];

    const sorted = [...entities].sort(sortByPublicationDate);

    expect(sorted[0]?.id).toBe("new");
    expect(sorted[1]?.id).toBe("mid");
    expect(sorted[2]?.id).toBe("old");
  });

  it("should fall back to created date when publishedAt is null", () => {
    const entities = [
      {
        id: "published",
        created: "2024-01-01T00:00:00Z",
        metadata: { publishedAt: "2024-01-15T00:00:00Z" },
      },
      {
        id: "draft",
        created: "2024-02-01T00:00:00Z",
        metadata: { publishedAt: null },
      },
    ];

    const sorted = [...entities].sort(sortByPublicationDate);

    expect(sorted[0]?.id).toBe("draft");
    expect(sorted[1]?.id).toBe("published");
  });

  it("should fall back to created date when publishedAt is undefined", () => {
    const entities = [
      {
        id: "published",
        created: "2024-01-01T00:00:00Z",
        metadata: { publishedAt: "2024-01-15T00:00:00Z" },
      },
      {
        id: "draft",
        created: "2024-02-01T00:00:00Z",
        metadata: {},
      },
    ];

    const sorted = [...entities].sort(sortByPublicationDate);

    expect(sorted[0]?.id).toBe("draft");
    expect(sorted[1]?.id).toBe("published");
  });

  it("should handle all entities without publishedAt", () => {
    const entities = [
      {
        id: "old",
        created: "2024-01-01T00:00:00Z",
        metadata: {},
      },
      {
        id: "new",
        created: "2024-02-01T00:00:00Z",
        metadata: {},
      },
    ];

    const sorted = [...entities].sort(sortByPublicationDate);

    expect(sorted[0]?.id).toBe("new");
    expect(sorted[1]?.id).toBe("old");
  });

  it("should handle empty array", () => {
    const entities: Array<{
      id: string;
      created: string;
      metadata: { publishedAt?: string };
    }> = [];

    const sorted = [...entities].sort(sortByPublicationDate);

    expect(sorted).toHaveLength(0);
  });

  it("should handle single element array", () => {
    const entities = [
      {
        id: "only",
        created: "2024-01-01T00:00:00Z",
        metadata: { publishedAt: "2024-01-15T00:00:00Z" },
      },
    ];

    const sorted = [...entities].sort(sortByPublicationDate);

    expect(sorted).toHaveLength(1);
    expect(sorted[0]?.id).toBe("only");
  });
});

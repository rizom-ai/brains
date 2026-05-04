import { describe, it, expect } from "bun:test";
import { findExistingWish, type WishSearchDeps } from "../src/lib/wish-dedup";
import type { WishEntity } from "../src/schemas/wish";

function createMockWish(overrides: Partial<WishEntity> = {}): WishEntity {
  return {
    id: "calendar-integration",
    entityType: "wish",
    content: "---\ntitle: Calendar integration\n---\nSync Google Calendar",
    contentHash: "",
    created: "2026-01-01T00:00:00Z",
    updated: "2026-01-01T00:00:00Z",
    metadata: {
      title: "Calendar integration",
      status: "new",
      priority: "medium",
      requested: 1,
      slug: "calendar-integration",
    },
    ...overrides,
  };
}

function createDeps(overrides: Partial<WishSearchDeps> = {}): WishSearchDeps {
  return {
    search: async () => [],
    getEntity: async () => null,
    similarityThreshold: 0.85,
    ...overrides,
  };
}

describe("findExistingWish", () => {
  it("should return null when no similar wishes exist", async () => {
    const deps = createDeps();

    const result = await findExistingWish(deps, {
      title: "Calendar integration",
      description: "Sync Google Calendar events",
    });

    expect(result).toBeNull();
  });

  it("should return match when search finds a wish above threshold", async () => {
    const existing = createMockWish();
    const deps = createDeps({
      search: async () => [{ entity: existing, score: 0.92, excerpt: "" }],
    });

    const result = await findExistingWish(deps, {
      title: "Google Calendar sync",
      description: "Integrate with Google Calendar",
    });

    expect(result).toBe(existing);
  });

  it("should ignore search results below threshold", async () => {
    const existing = createMockWish();
    const deps = createDeps({
      search: async () => [{ entity: existing, score: 0.5, excerpt: "" }],
    });

    const result = await findExistingWish(deps, {
      title: "Email digest",
      description: "Weekly email summary",
    });

    expect(result).toBeNull();
  });

  it("should fall back to slug match when search returns nothing", async () => {
    const existing = createMockWish();
    const deps = createDeps({
      search: async () => [],
      getEntity: async (request) =>
        request.id === "calendar-integration" ? existing : null,
    });

    const result = await findExistingWish(deps, {
      title: "Calendar integration",
      description: "Different description but same title",
    });

    expect(result).toBe(existing);
  });

  it("should prefer semantic match over slug fallback", async () => {
    const semanticMatch = createMockWish({ id: "gcal-sync" });
    const slugMatch = createMockWish({ id: "calendar-integration" });
    const deps = createDeps({
      search: async () => [{ entity: semanticMatch, score: 0.95, excerpt: "" }],
      getEntity: async (request) =>
        request.id === "calendar-integration" ? slugMatch : null,
    });

    const result = await findExistingWish(deps, {
      title: "Calendar integration",
      description: "Sync events",
    });

    expect(result).toBe(semanticMatch);
  });

  it("should use custom similarity threshold", async () => {
    const existing = createMockWish();
    const deps = createDeps({
      search: async () => [{ entity: existing, score: 0.7, excerpt: "" }],
      similarityThreshold: 0.6,
    });

    const result = await findExistingWish(deps, {
      title: "Calendar sync",
      description: "Sync calendar events",
    });

    expect(result).toBe(existing);
  });

  it("should search with title and description combined", async () => {
    let capturedQuery = "";
    const deps = createDeps({
      search: async (query: string) => {
        capturedQuery = query;
        return [];
      },
    });

    await findExistingWish(deps, {
      title: "Calendar integration",
      description: "Sync Google Calendar events",
    });

    expect(capturedQuery).toBe(
      "Calendar integration: Sync Google Calendar events",
    );
  });
});

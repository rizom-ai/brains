import { beforeEach, describe, it, expect } from "bun:test";
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
    visibility: "public",
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

function near(
  wish: WishEntity,
  distance: number,
): Array<{ entity: WishEntity; distance: number }> {
  return [{ entity: wish, distance }];
}

function createDeps(
  wishes: WishEntity[],
  overrides: Partial<WishSearchDeps> = {},
): WishSearchDeps {
  return {
    nearest: async () => [],
    getEntity: async (request) =>
      wishes.find((wish) => wish.id === request.id) ?? null,
    maxDistance: 0.3,
    ai: {
      generateObject: async <T>(
        prompt: string,
        schema: { parse(value: unknown): T },
      ): Promise<{ object: T }> => {
        checks.push(prompt);
        return { object: schema.parse({ same: sameVerdict }) };
      },
    },
    ...overrides,
  };
}

let checks: string[] = [];
let sameVerdict = true;

const incoming = {
  title: "Google Calendar sync",
  content:
    "---\ntitle: Google Calendar sync\n---\nIntegrate with Google Calendar",
};

describe("findExistingWish", () => {
  beforeEach(() => {
    checks = [];
    sameVerdict = true;
  });

  it("should return null when no similar wishes exist", async () => {
    const result = await findExistingWish(createDeps([]), incoming);

    expect(result).toBeNull();
  });

  it("should return a wish within the distance", async () => {
    const existing = createMockWish();
    const deps = createDeps([existing], {
      nearest: async () => near(existing, 0.19),
    });

    expect(await findExistingWish(deps, incoming)).toBe(existing);
  });

  it("should ignore a wish beyond the distance", async () => {
    const existing = createMockWish();
    const deps = createDeps([existing], {
      nearest: async () => near(existing, 0.36),
    });

    expect(
      await findExistingWish(deps, {
        title: "Email digest",
        content: "---\ntitle: Email digest\n---\nWeekly email summary",
      }),
    ).toBeNull();
  });

  it("should fall back to slug match when nothing is near", async () => {
    const existing = createMockWish();

    const result = await findExistingWish(createDeps([existing]), {
      title: "Calendar integration",
      content: "---\ntitle: Calendar integration\n---\nDifferent description",
    });

    expect(result).toBe(existing);
  });

  it("should prefer semantic match over slug fallback", async () => {
    const semanticMatch = createMockWish({ id: "gcal-sync" });
    const slugMatch = createMockWish({ id: "calendar-integration" });
    const deps = createDeps([semanticMatch, slugMatch], {
      nearest: async () => near(semanticMatch, 0.1),
    });

    const result = await findExistingWish(deps, {
      title: "Calendar integration",
      content: "---\ntitle: Calendar integration\n---\nSync events",
    });

    expect(result).toBe(semanticMatch);
  });

  it("should use a custom distance", async () => {
    const existing = createMockWish();
    const deps = createDeps([existing], {
      nearest: async () => near(existing, 0.4),
      maxDistance: 0.45,
    });

    expect(await findExistingWish(deps, incoming)).toBe(existing);
  });

  it("should measure the new wish's markdown, the form wishes are embedded in", async () => {
    const queries: string[] = [];
    const deps = createDeps([], {
      nearest: async ({ query }) => {
        queries.push(query);
        return [];
      },
    });

    await findExistingWish(deps, incoming);

    expect(queries).toEqual([incoming.content]);
  });

  it("skips a close wish the check says asks for something else", async () => {
    const existing = createMockWish({ id: "send-emails" });
    const deps = createDeps([existing], {
      nearest: async () => near(existing, 0.2),
    });
    sameVerdict = false;

    const result = await findExistingWish(deps, {
      title: "Stop sending emails",
      content:
        "---\ntitle: Stop sending emails\n---\nUser wants email sending off",
    });

    expect(result).toBeNull();
    expect(checks).toHaveLength(1);
    expect(checks[0]).toContain("Stop sending emails");
    expect(checks[0]).toContain("Calendar integration");
  });
});

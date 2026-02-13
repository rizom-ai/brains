import { describe, expect, test, mock } from "bun:test";
import { ensureUniqueTitle } from "../../src/service/create-entity-with-unique-title";
import type { BaseEntity } from "@brains/entity-service";
import type { ServicePluginContext } from "../../src/service/context";
import { createSilentLogger } from "@brains/test-utils";

type MockContext = Pick<
  ServicePluginContext,
  "entityService" | "ai" | "logger"
>;

function createMockContext(
  existingIds: Set<string>,
  aiTitle: string,
): {
  context: MockContext;
  mocks: { generateObject: ReturnType<typeof mock> };
} {
  const getEntity = mock(async (_entityType: string, id: string) => {
    if (existingIds.has(id)) {
      return {
        id,
        entityType: "post",
        content: "",
        metadata: {},
        created: "",
        updated: "",
        contentHash: "",
      } as BaseEntity;
    }
    return null;
  });

  const generateObject = mock(async () => ({
    object: { title: aiTitle },
  }));

  return {
    context: {
      entityService: {
        getEntity,
      } as unknown as ServicePluginContext["entityService"],
      ai: { generateObject } as unknown as ServicePluginContext["ai"],
      logger: createSilentLogger(),
    },
    mocks: { generateObject },
  };
}

const deriveId = (title: string): string =>
  title.toLowerCase().replace(/\s+/g, "-");

describe("ensureUniqueTitle", () => {
  test("no collision — returns original title", async () => {
    const { context, mocks } = createMockContext(new Set(), "Unused");

    const result = await ensureUniqueTitle({
      entityType: "post",
      title: "My Post",
      deriveId,
      regeneratePrompt: "Generate a different title",
      context,
    });

    expect(result).toBe("My Post");
    expect(mocks.generateObject).not.toHaveBeenCalled();
  });

  test("collision — asks AI and returns new title", async () => {
    const { context, mocks } = createMockContext(
      new Set(["my-post"]),
      "A Fresh Perspective",
    );

    const result = await ensureUniqueTitle({
      entityType: "post",
      title: "My Post",
      deriveId,
      regeneratePrompt: "Generate a different title",
      context,
    });

    expect(result).toBe("A Fresh Perspective");
    expect(mocks.generateObject).toHaveBeenCalledTimes(1);
  });

  test("includes original title and regeneratePrompt in AI prompt", async () => {
    const { context, mocks } = createMockContext(
      new Set(["my-post"]),
      "Better Title",
    );

    await ensureUniqueTitle({
      entityType: "post",
      title: "My Post",
      deriveId,
      regeneratePrompt: "Generate a unique blog post title about TypeScript",
      context,
    });

    const prompt = mocks.generateObject.mock.calls[0]?.[0] as string;
    expect(prompt).toContain("My Post");
    expect(prompt).toContain(
      "Generate a unique blog post title about TypeScript",
    );
  });

  test("uses deriveId to check collision, not raw title", async () => {
    // "My Post" derives to "my-post" which exists, but raw title doesn't
    const { context, mocks } = createMockContext(
      new Set(["my-post"]),
      "New Title",
    );

    const result = await ensureUniqueTitle({
      entityType: "post",
      title: "My Post",
      deriveId,
      regeneratePrompt: "Generate a different title",
      context,
    });

    expect(result).toBe("New Title");
    expect(mocks.generateObject).toHaveBeenCalledTimes(1);
  });
});

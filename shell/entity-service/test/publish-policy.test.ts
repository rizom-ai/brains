import { describe, expect, it } from "bun:test";
import type { IEntityRegistry } from "../src";
import { getPublishBoundaryState } from "../src";

function registry(
  publishStatuses?: string[],
): Pick<IEntityRegistry, "getEntityTypeConfig"> {
  return {
    getEntityTypeConfig: () =>
      publishStatuses ? { publish: { publishStatuses } } : {},
  };
}

describe("getPublishBoundaryState", () => {
  it("classifies entry into and updates within the publish set", () => {
    const entityRegistry = registry(["queued", "published", "failed"]);

    expect(
      getPublishBoundaryState("post", "draft", "queued", entityRegistry),
    ).toBe("boundary");
    expect(
      getPublishBoundaryState("post", "queued", "failed", entityRegistry),
    ).toBe("within-publish-set");
  });

  it("keeps draft and unconfigured updates outside the publish boundary", () => {
    expect(
      getPublishBoundaryState(
        "post",
        "published",
        "draft",
        registry(["published"]),
      ),
    ).toBe("non-publish");
    expect(
      getPublishBoundaryState("note", undefined, "published", registry()),
    ).toBe("non-publish");
  });
});

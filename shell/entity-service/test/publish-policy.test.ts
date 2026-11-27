import { describe, expect, it } from "bun:test";
import type { IEntityRegistry } from "../src";
import { getPublishBoundaryState, requiredUpdateActions } from "../src";

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

describe("requiredUpdateActions", () => {
  const seminars = registry(["published"]);
  const draft = {
    content: "---\nquestion: What is religion?\nstatus: draft\n---\nA turn.\n",
    metadata: { question: "What is religion?", status: "draft" },
    visibility: "public",
  };
  const published = {
    content:
      "---\nquestion: What is religion?\nstatus: published\n---\nA turn.\n",
    metadata: { question: "What is religion?", status: "published" },
    visibility: "public",
  };

  it("needs update alone for a write that publishes nothing", () => {
    expect(
      requiredUpdateActions(
        "seminar",
        draft,
        { ...draft, content: draft.content.replace("A turn.", "Another.") },
        seminars,
      ),
    ).toEqual(["update"]);
    expect(requiredUpdateActions("note", draft, published, registry())).toEqual(
      ["update"],
    );
  });

  it("needs publish alone for a write that only publishes", () => {
    expect(
      requiredUpdateActions("seminar", draft, published, seminars),
    ).toEqual(["publish"]);
  });

  it("needs update as well when a publishing write changes anything else", () => {
    for (const changed of [
      { ...published, content: published.content.replace("A turn.", "Mine.") },
      {
        ...published,
        content: published.content.replace("What is religion?", "Edited?"),
      },
      {
        ...published,
        metadata: { ...published.metadata, question: "Edited?" },
      },
      { ...published, visibility: "restricted" },
    ]) {
      expect(
        requiredUpdateActions("seminar", draft, changed, seminars),
      ).toEqual(["publish", "update"]);
    }
  });

  it("needs both to change what is already published, and publish alone to restate it", () => {
    expect(
      requiredUpdateActions(
        "seminar",
        published,
        {
          ...published,
          content: published.content.replace("A turn.", "Mine."),
        },
        seminars,
      ),
    ).toEqual(["publish", "update"]);
    expect(
      requiredUpdateActions("seminar", published, published, seminars),
    ).toEqual(["publish"]);
  });

  it("does not count a header's key order, or a body given without its header", () => {
    expect(
      requiredUpdateActions(
        "seminar",
        draft,
        {
          ...published,
          content:
            "---\nstatus: published\nquestion: What is religion?\n---\nA turn.\n",
        },
        seminars,
      ),
    ).toEqual(["publish"]);
    expect(
      requiredUpdateActions(
        "seminar",
        { ...draft, content: "A turn.\n" },
        { ...published, content: "A turn.\n" },
        seminars,
      ),
    ).toEqual(["publish"]);
  });
});

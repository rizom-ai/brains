import { describe, expect, it, test } from "bun:test";
import type { EntitySummary, FieldDescriptor } from "./api";
import {
  entityRowDate,
  entityRowCover,
  entityRowExcerpt,
  entityRowStatus,
  optionLabel,
  sentenceLabel,
} from "./ui-utils";

test("sentence labels lowercase ordinary words and keep acronyms and brands", () => {
  expect(sentenceLabel("Note")).toBe("note");
  expect(sentenceLabel("Social Post")).toBe("social post");
  expect(sentenceLabel("FAQ")).toBe("FAQ");
  expect(sentenceLabel("LinkedIn Post")).toBe("LinkedIn post");
  expect(sentenceLabel("Ask Content")).toBe("ask content");
});

test("option labels read as words while values stay as stored", () => {
  expect(optionLabel("published")).toBe("Published");
  expect(optionLabel("summary_large_image")).toBe("Summary large image");
  expect(optionLabel("in-review")).toBe("In review");
  expect(optionLabel("GET")).toBe("GET");
});

describe("a Library row's status and date", () => {
  const fields: FieldDescriptor[] = [
    {
      name: "status",
      label: "Status",
      widget: "enum",
      options: ["draft", "queued", "published", "failed"],
    },
    {
      name: "publishedAt",
      label: "Published At",
      widget: "datetime",
      column: "date",
    },
  ];
  const entry = (frontmatter: Record<string, unknown>): EntitySummary => ({
    id: "field-notes",
    entityType: "post",
    frontmatter,
    updated: "2026-11-27T08:00:00.000Z",
  });

  it("states the entry's own status, not only draft or published", () => {
    expect(entityRowStatus(entry({ status: "queued" }), fields)).toBe("queued");
    // Generation states are shown by the row's generation marker.
    expect(entityRowStatus(entry({ status: "failed" }), fields)).toBeNull();
    expect(
      entityRowStatus(entry({ published: true }), [
        { name: "published", label: "Published", widget: "boolean" },
      ]),
    ).toBe("published");
    expect(entityRowStatus(entry({}), [])).toBeNull();
  });

  it("finds the cover image a type names for its rows", () => {
    const withCover: FieldDescriptor[] = [
      {
        name: "coverImageId",
        label: "Cover",
        widget: "image",
        column: "cover",
      },
    ];
    expect(
      entityRowCover(entry({ coverImageId: "sensor-wall" }), withCover),
    ).toBe("sensor-wall");
    expect(entityRowCover(entry({}), withCover)).toBeNull();
    expect(
      entityRowCover(entry({ coverImageId: "sensor-wall" }), fields),
    ).toBeNull();
  });

  it("shows the field a type names as its excerpt, when it says something", () => {
    const withExcerpt: FieldDescriptor[] = [
      { name: "excerpt", label: "Excerpt", widget: "text", column: "excerpt" },
    ];
    expect(
      entityRowExcerpt(
        entry({ excerpt: "  Every reading kept.\n" }),
        withExcerpt,
      ),
    ).toBe("Every reading kept.");
    expect(entityRowExcerpt(entry({ excerpt: " " }), withExcerpt)).toBeNull();
    expect(entityRowExcerpt(entry({ excerpt: "Kept" }), fields)).toBeNull();
  });

  it("dates a published entry by its publication, anything else by its last edit", () => {
    expect(
      entityRowDate(
        entry({ status: "published", publishedAt: "2025-11-20T01:00:00.000Z" }),
        fields,
      ),
    ).toEqual({ kind: "published", iso: "2025-11-20T01:00:00.000Z" });
    expect(
      entityRowDate(
        entry({ status: "draft", publishedAt: "2025-11-20T01:00:00.000Z" }),
        fields,
      ),
    ).toEqual({ kind: "edited", iso: "2026-11-27T08:00:00.000Z" });
    // Published without a date to show: its last edit.
    expect(entityRowDate(entry({ status: "published" }), fields)).toEqual({
      kind: "edited",
      iso: "2026-11-27T08:00:00.000Z",
    });
  });
});

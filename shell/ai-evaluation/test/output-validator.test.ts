import { describe, expect, it } from "bun:test";

import { OutputValidator } from "../src/output-validator";

describe("OutputValidator", () => {
  it("validates array counts", () => {
    const validator = OutputValidator.createFresh();

    const failures = validator.validate([{ title: "one" }], {
      minItems: 2,
      maxItems: 0,
      exactItems: 3,
    });

    expect(failures.map((failure) => failure.criterion)).toEqual([
      "exactItems",
      "minItems",
      "maxItems",
    ]);
  });

  it("validates itemsContain and itemsNotContain", () => {
    const validator = OutputValidator.createFresh();

    const failures = validator.validate(
      [{ title: "alpha launch" }, { title: "beta release" }],
      {
        itemsContain: [{ field: "title", words: ["gamma"] }],
        itemsNotContain: [{ field: "title", pattern: "beta" }],
      },
    );

    expect(failures.map((failure) => failure.criterion)).toEqual([
      "itemsContain",
      "itemsNotContain",
    ]);
  });

  it("validates paths for every array item", () => {
    const validator = OutputValidator.createFresh();

    const failures = validator.validate(
      [{ source: { type: "note" } }, { source: { type: "link" } }],
      {
        validateEach: [
          { path: "source.type", exists: true },
          { path: "source.type", equals: "note" },
          { path: "source.type", matches: "^note$" },
        ],
      },
    );

    expect(failures.map((failure) => failure.criterion)).toEqual([
      "validateEach.equals",
      "validateEach.matches",
    ]);
    expect(failures[0]?.message).toContain("Item[1].source.type");
  });

  it("validates object paths", () => {
    const validator = OutputValidator.createFresh();

    const failures = validator.validate(
      { metadata: { status: "draft" } },
      {
        validateEach: [
          { path: "metadata.status", exists: true },
          { path: "metadata.status", equals: "published" },
        ],
      },
    );

    expect(failures).toHaveLength(1);
    expect(failures[0]?.criterion).toBe("validateEach.equals");
  });

  it("reports expected array output type", () => {
    const validator = OutputValidator.createFresh();

    const failures = validator.validate({ item: "not-array" }, { minItems: 1 });

    expect(failures).toHaveLength(1);
    expect(failures[0]?.criterion).toBe("outputType");
  });
});

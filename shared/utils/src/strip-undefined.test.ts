import { describe, expect, it } from "bun:test";
import { stripUndefinedDeep } from "./strip-undefined";

describe("stripUndefinedDeep", () => {
  it("removes undefined object keys recursively", () => {
    expect(
      stripUndefinedDeep({
        keep: "value",
        drop: undefined,
        nested: {
          keep: 1,
          drop: undefined,
          deeper: { keep: true, drop: undefined },
        },
      }),
    ).toEqual({
      keep: "value",
      nested: {
        keep: 1,
        deeper: { keep: true },
      },
    });
  });

  it("preserves array positions while cleaning contained objects", () => {
    expect(
      stripUndefinedDeep([
        { keep: "a", drop: undefined },
        undefined,
        { keep: "b", nested: { drop: undefined } },
      ]),
    ).toEqual([{ keep: "a" }, undefined, { keep: "b", nested: {} }]);
  });

  it("preserves binary data instances", () => {
    const bytes = new Uint8Array([1, 2, 3]);

    expect(stripUndefinedDeep({ bytes, drop: undefined })).toEqual({ bytes });
  });
});

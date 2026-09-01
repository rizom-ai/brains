import { describe, expect, it } from "bun:test";
import { definedFields } from "../src/strip-undefined";

describe("definedFields", () => {
  it("drops keys whose value is undefined", () => {
    expect(definedFields({ a: 1, b: undefined, c: "x" })).toEqual({
      a: 1,
      c: "x",
    });
  });

  it("keeps falsy values that are not undefined", () => {
    expect(definedFields({ zero: 0, empty: "", no: false, nil: null })).toEqual(
      {
        zero: 0,
        empty: "",
        no: false,
        nil: null,
      },
    );
  });

  it("omits the key entirely rather than setting it to undefined", () => {
    const result = definedFields({ a: undefined });
    expect(Object.keys(result)).toEqual([]);
    expect("a" in result).toBe(false);
  });

  it("is shallow — nested undefined values are left alone", () => {
    const nested = { keep: { inner: undefined } };
    expect(definedFields(nested)).toEqual(nested);
  });

  it("returns an object spreadable into an exactOptionalPropertyTypes target", () => {
    interface Target {
      required: string;
      optional?: string;
    }
    const optional: string | undefined = undefined;
    const target: Target = { required: "r", ...definedFields({ optional }) };
    expect(target).toEqual({ required: "r" });
  });
});

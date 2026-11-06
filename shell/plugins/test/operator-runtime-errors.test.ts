import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  parseOperatorData,
  runtimeError,
  validationDetail,
  type OperatorRuntimeIdentity,
} from "../src/operator/operator-runtime-errors";

const identity: OperatorRuntimeIdentity = {
  publicServiceId: "reading",
  packageName: "@fixture/reading",
  surface: "dashboard widget",
  id: "status",
};

describe("operator runtime errors", () => {
  it("names the service, package, and surface before the stage", () => {
    expect(runtimeError(identity, "data loader failed").message).toBe(
      'Service "reading" package "@fixture/reading" dashboard widget "status" data loader failed',
    );
  });

  it("appends detail after a colon when present", () => {
    expect(
      runtimeError(
        { ...identity, surface: "Studio workspace", id: "drafts" },
        "returned invalid data",
        "title: Required",
      ).message,
    ).toBe(
      'Service "reading" package "@fixture/reading" Studio workspace "drafts" returned invalid data: title: Required',
    );
  });

  it("omits an empty detail", () => {
    expect(runtimeError(identity, "view derivation failed", "").message).toBe(
      'Service "reading" package "@fixture/reading" dashboard widget "status" view derivation failed',
    );
  });
});

describe("validationDetail", () => {
  it("joins issue paths with dots and names the root value", () => {
    expect(
      validationDetail([
        { path: ["blocks", 0, "title"], message: "Required" },
        { path: [], message: "Expected object" },
      ]),
    ).toBe("blocks.0.title: Required; value: Expected object");
  });

  it("reports at most five issues", () => {
    const issues = ["a", "b", "c", "d", "e", "f"].map((key) => ({
      path: [key],
      message: "bad",
    }));
    expect(validationDetail(issues)).toBe(
      "a: bad; b: bad; c: bad; d: bad; e: bad",
    );
  });
});

describe("parseOperatorData", () => {
  const schema = z.object({ count: z.number().transform((n) => n * 2) });

  it("returns the parsed output", () => {
    expect(parseOperatorData(schema, { count: 2 }, identity)).toEqual({
      count: 4,
    });
  });

  it("throws a runtime error with validation detail", () => {
    expect(() => parseOperatorData(schema, { count: "two" }, identity)).toThrow(
      'Service "reading" package "@fixture/reading" dashboard widget "status" returned invalid data; return a value matching its data schema: count: ',
    );
  });
});

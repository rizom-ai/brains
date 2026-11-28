import { describe, expect, test } from "bun:test";
import { lintNodeOptions } from "./lint-node-options";

describe("the Node options eslint runs under", () => {
  test("load the compat module and raise the heap above Node's default", () => {
    expect(lintNodeOptions(undefined, "/repo/scripts/compat.cjs")).toBe(
      "--max-old-space-size=8192 --require=/repo/scripts/compat.cjs",
    );
  });

  test("keep the caller's options, ahead of the compat module", () => {
    expect(
      lintNodeOptions(" --trace-warnings ", "/repo/scripts/compat.cjs"),
    ).toBe(
      "--trace-warnings --max-old-space-size=8192 --require=/repo/scripts/compat.cjs",
    );
  });

  test("leave a heap size the caller set as it is", () => {
    expect(
      lintNodeOptions("--max-old-space-size=12288", "/repo/scripts/compat.cjs"),
    ).toBe("--max-old-space-size=12288 --require=/repo/scripts/compat.cjs");
  });
});

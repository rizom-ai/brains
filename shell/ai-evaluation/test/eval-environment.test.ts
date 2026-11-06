import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { rmSync } from "fs";
import { prepareEvalEnvironment } from "../src/eval-environment";

describe("prepareEvalEnvironment", () => {
  const bases: string[] = [];

  afterEach(() => {
    for (const base of bases.splice(0)) {
      rmSync(`${base}-git-remote`, { recursive: true, force: true });
      rmSync(`${base}-data`, { recursive: true, force: true });
    }
    delete process.env["EVAL_GIT_REMOTE"];
  });

  it("gives runs started in the same millisecond separate data paths", () => {
    const now = spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    try {
      bases.push(prepareEvalEnvironment(), prepareEvalEnvironment());
    } finally {
      now.mockRestore();
    }

    expect(bases[0]).not.toBe(bases[1]);
  });
});

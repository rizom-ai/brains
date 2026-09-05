import { describe, expect, test } from "bun:test";
import { findSilentCatchesInSource } from "./check-silent-catches";

/**
 * Fixtures are strings rather than real code so the check cannot scan them,
 * and so each one isolates exactly one decision the rule makes.
 */

const wideBody = Array.from(
  { length: 8 },
  (_, index) => `    const step${index} = compute(${index});`,
).join("\n");

function wideTry(catchBody: string, binding = "(error)"): string {
  return `async function example() {
  try {
${wideBody}
    return step0;
  } catch ${binding} {
${catchBody}
  }
}`;
}

describe("wide catches that discard their error", () => {
  test("flags one that neither rethrows, reads, logs nor explains", () => {
    const findings = findSilentCatchesInSource(
      "example.ts",
      wideTry("    return fallback();"),
    );
    expect(findings).toEqual([
      { file: "example.ts", line: 12, width: 9, reason: "discards" },
    ]);
  });

  test("accepts one that rethrows", () => {
    expect(
      findSilentCatchesInSource("example.ts", wideTry("    throw error;")),
    ).toEqual([]);
  });

  test("accepts one that explains itself", () => {
    expect(
      findSilentCatchesInSource(
        "example.ts",
        wideTry("    // Absence is the answer here.\n    return fallback();"),
      ),
    ).toEqual([]);
  });

  test("accepts a narrow one, whose subject is self-evident", () => {
    const source = `async function example() {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback();
  }
}`;
    expect(findSilentCatchesInSource("example.ts", source)).toEqual([]);
  });
});

describe("wide catches that log and hand back a default", () => {
  test("flags one, because logging names the failure but the caller still cannot see it", () => {
    const findings = findSilentCatchesInSource(
      "example.ts",
      wideTry(
        '    this.logger.warn("step failed", { error });\n    return null;',
      ),
    );
    expect(findings).toEqual([
      { file: "example.ts", line: 12, width: 9, reason: "defaults" },
    ]);
  });

  test("flags one that logs through a capitalised logger class", () => {
    const findings = findSilentCatchesInSource(
      "example.ts",
      wideTry(
        '    ConsoleLogger.getInstance().error("failed", error);\n    return [];',
      ),
    );
    expect(findings.map((finding) => finding.reason)).toEqual(["defaults"]);
  });

  test("accepts one that says why the default is the right answer", () => {
    expect(
      findSilentCatchesInSource(
        "example.ts",
        wideTry(
          "    // Optimisation is optional; the original still renders.\n" +
            '    this.logger.warn("failed", { error });\n    return null;',
        ),
      ),
    ).toEqual([]);
  });

  test("accepts one that returns something derived from the error", () => {
    expect(
      findSilentCatchesInSource(
        "example.ts",
        wideTry(
          '    this.logger.warn("failed", { error });\n' +
            "    return { ok: false, message: getErrorMessage(error) };",
        ),
      ),
    ).toEqual([]);
  });

  test("accepts a narrow one, where the default cannot hide much", () => {
    const source = `async function example() {
  try {
    return await read(path);
  } catch (error) {
    logger.warn("unreadable", { error });
    return null;
  }
}`;
    expect(findSilentCatchesInSource("example.ts", source)).toEqual([]);
  });
});

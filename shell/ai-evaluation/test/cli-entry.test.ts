import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { API_KEY_VARIABLES, hasConfiguredApiKey } from "../src/cli-bootstrap";
import { printHelp } from "../src/cli-help";

/**
 * The CLI entry layer: environment bootstrap and help output. Both are things
 * a developer hits before any evaluation runs, and neither had a test — a
 * broken key check fails the run with the wrong reason, and help that has
 * drifted from the parser sends people to flags that do nothing.
 */

function captureHelp(): string {
  const lines: string[] = [];
  const log = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  });
  try {
    printHelp();
  } finally {
    log.mockRestore();
  }
  return lines.join("\n");
}

afterEach(() => {
  spyOn(console, "log").mockRestore();
});

describe("hasConfiguredApiKey", () => {
  it("accepts any single provider key", () => {
    for (const name of API_KEY_VARIABLES) {
      expect(hasConfiguredApiKey({ [name]: "sk-test" })).toBe(true);
    }
  });

  it("rejects an environment with no key at all", () => {
    expect(hasConfiguredApiKey({})).toBe(false);
    expect(hasConfiguredApiKey({ UNRELATED: "value" })).toBe(false);
  });

  it("rejects a key that is present but blank", () => {
    // An exported-but-empty variable is the usual shape of a misconfigured
    // .env, and it must not read as configured — the run would fail later with
    // an authentication error instead of this check's actionable message.
    expect(hasConfiguredApiKey({ AI_API_KEY: "" })).toBe(false);
    expect(hasConfiguredApiKey({ AI_API_KEY: "   " })).toBe(false);
  });

  it("accepts when one provider is set and another is blank", () => {
    expect(
      hasConfiguredApiKey({ OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "sk-test" }),
    ).toBe(true);
  });
});

describe("printHelp", () => {
  it("shows the usage line and the invocation it belongs to", () => {
    const help = captureHelp();

    expect(help).toContain("Usage: bun run eval");
    expect(help).toContain("Options:");
    expect(help).toContain("Examples:");
  });

  it("documents every flag the parser accepts", () => {
    // A drift guard, not a formatting assertion. Help that omits a working flag
    // hides it; help that lists a removed one sends people to a no-op. Both are
    // silent, which is why this is checked rather than reviewed.
    const parserSource = readFileSync(
      join(import.meta.dir, "..", "src", "cli-options.ts"),
      "utf-8",
    );
    const accepted = new Set(
      [...parserSource.matchAll(/"(--[a-z-]+)"/g)].map((match) => match[1]),
    );
    expect(accepted.size).toBeGreaterThan(0);

    const help = captureHelp();
    // Matched at a word boundary, not as a substring: `help.includes("--tool")`
    // is satisfied by `--tool-surface`, so a renamed flag would look documented
    // while nothing by that name existed.
    const documented = (flag: string): boolean =>
      new RegExp(`${flag}(?![\\w-])`).test(help);
    const undocumented = [...accepted].filter(
      (flag) => flag !== undefined && !documented(flag),
    );

    expect(undocumented).toEqual([]);
  });

  it("documents the short aliases too", () => {
    const help = captureHelp();

    expect(help).toContain("-p");
    expect(help).toContain("-v");
  });
});

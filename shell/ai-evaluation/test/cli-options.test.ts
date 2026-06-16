import { describe, expect, it } from "bun:test";

import {
  parseCliOptions,
  parseFlag,
  parseSingleFlag,
} from "../src/cli-options";

describe("cli options", () => {
  it("parses single-value and comma-separated flags", () => {
    const args = ["--tags", "core,smoke", "--url", "http://localhost:8080"];

    expect(parseFlag(args, "--tags")).toEqual(["core", "smoke"]);
    expect(parseSingleFlag(args, "--url")).toBe("http://localhost:8080");
  });

  it("ignores missing flag values", () => {
    const args = ["--tags", "--verbose"];

    expect(parseFlag(args, "--tags")).toBeUndefined();
    expect(parseSingleFlag(args, "--tags")).toBeUndefined();
  });

  it("parses evaluation options", () => {
    const options = parseCliOptions([
      "--skip-llm-judge",
      "--parallel",
      "--max-parallel",
      "5",
      "--verbose",
      "--tool-coverage",
      "--suite",
      "default",
      "--tags",
      "core,smoke",
      "--test",
      "a,b",
      "--type",
      "plugin",
      "--preset",
      "core",
      "--url",
      "http://localhost:8080",
      "--token",
      "secret",
      "--compare",
      "baseline",
      "--baseline",
      "next",
    ]);

    expect(options).toEqual({
      skipLLMJudge: true,
      parallel: true,
      maxParallel: 5,
      verbose: true,
      toolCoverage: true,
      suite: "default",
      tags: ["core", "smoke"],
      testCaseIds: ["a", "b"],
      testType: "plugin",
      preset: "core",
      remoteUrl: "http://localhost:8080",
      authToken: "secret",
      compareAgainst: "baseline",
      saveBaseline: "next",
    });
  });

  it("supports aliases and compare-with-last-run", () => {
    const options = parseCliOptions([
      "-p",
      "-v",
      "--filter",
      "fallback",
      "--compare",
    ]);

    expect(options.parallel).toBe(true);
    expect(options.verbose).toBe(true);
    expect(options.toolCoverage).toBe(false);
    expect(options.testCaseIds).toEqual(["fallback"]);
    expect(options.compareAgainst).toBe("");
  });

  it("ignores invalid test types and presets", () => {
    const options = parseCliOptions(["--type", "bad", "--preset", "bad"]);

    expect(options.testType).toBeUndefined();
    expect(options.preset).toBeUndefined();
  });
});

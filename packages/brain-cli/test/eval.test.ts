import { describe, it, expect } from "bun:test";
import { parseArgs } from "../src/parse-args";
import { buildEvalArgs } from "../src/commands/eval";

describe("brain eval routing", () => {
  it("should parse 'eval' as a command", () => {
    const result = parseArgs(["eval"]);
    expect(result.command).toBe("eval");
  });

  it("should parse 'eval' with extra args as positional", () => {
    const result = parseArgs(["eval", "--test", "my-test"]);
    expect(result.command).toBe("eval");
  });
});

describe("buildEvalArgs", () => {
  it("should extract raw args after 'eval' from argv", () => {
    const argv = ["eval", "--test", "tool-invocation-list"];
    const result = buildEvalArgs(argv);
    expect(result).toEqual(["--test", "tool-invocation-list"]);
  });

  it("should return empty array for bare eval", () => {
    const argv = ["eval"];
    const result = buildEvalArgs(argv);
    expect(result).toEqual([]);
  });

  it("should pass through all eval runner flags", () => {
    const argv = [
      "eval",
      "--test",
      "my-test",
      "--tags",
      "core",
      "--skip-llm-judge",
      "--verbose",
      "--compare",
    ];
    const result = buildEvalArgs(argv);
    expect(result).toEqual([
      "--test",
      "my-test",
      "--tags",
      "core",
      "--skip-llm-judge",
      "--verbose",
      "--compare",
    ]);
  });

  it("should pass through --url and --token for remote eval", () => {
    const argv = [
      "eval",
      "--url",
      "http://localhost:3333",
      "--token",
      "secret",
    ];
    const result = buildEvalArgs(argv);
    expect(result).toEqual([
      "--url",
      "http://localhost:3333",
      "--token",
      "secret",
    ]);
  });
});

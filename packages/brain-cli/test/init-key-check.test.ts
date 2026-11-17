import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "../src/parse-args";
import { runCommand } from "../src/run-command";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "brain-init-keys-"));
  dirs.push(dir);
  return dir;
}

describe("brain init and the keys its models need", () => {
  it("refuses a model whose key was not given, naming the key, and writes nothing", async () => {
    const cwd = workspace();

    const result = await runCommand(
      parseArgs([
        "init",
        "mybrain",
        "--model",
        "claude-sonnet-5",
        "--openai-api-key",
        "sk-test",
        "--no-interactive",
      ]),
      cwd,
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("ANTHROPIC_API_KEY");
    expect(existsSync(join(cwd, "mybrain"))).toBe(false);
  });

  it("scaffolds when every model it runs has its key", async () => {
    const cwd = workspace();

    const result = await runCommand(
      parseArgs([
        "init",
        "mybrain",
        "--model",
        "claude-sonnet-5",
        "--anthropic-api-key",
        "sk-ant-test",
        "--openai-api-key",
        "sk-test",
        "--no-interactive",
      ]),
      cwd,
    );

    expect(result.success).toBe(true);
    expect(existsSync(join(cwd, "mybrain", "brain.yaml"))).toBe(true);
  });
});

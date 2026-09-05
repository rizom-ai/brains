import { describe, expect, it } from "bun:test";
import { runProcess, runProcessOrThrow } from "../src/run-process";

describe("runProcess", () => {
  it("returns stdout and a zero exit for a command that succeeds", async () => {
    const result = await runProcess(["echo", "hello"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("hello");
  });

  it("returns a non-zero exit rather than throwing", async () => {
    const result = await runProcess(["sh", "-c", "echo oops >&2; exit 3"]);

    expect(result.exitCode).toBe(3);
    expect(result.stderr.trim()).toBe("oops");
  });

  it("runs in the requested directory", async () => {
    const result = await runProcess(["pwd"], { cwd: "/tmp" });

    expect(result.stdout.trim()).toBe("/tmp");
  });

  it("writes stdin and closes it", async () => {
    const result = await runProcess(["cat"], { stdin: "piped input" });

    expect(result.stdout).toBe("piped input");
  });

  it("rejects an empty command rather than spawning nothing", () => {
    expect(runProcess([])).rejects.toThrow("needs a command");
  });
});

describe("runProcessOrThrow", () => {
  it("returns stdout when the command succeeds", async () => {
    expect((await runProcessOrThrow(["echo", "fine"])).trim()).toBe("fine");
  });

  it("throws with the exit code and stderr when it fails", () => {
    expect(
      runProcessOrThrow(["sh", "-c", "echo boom >&2; exit 2"]),
    ).rejects.toThrow(/exited with 2: boom/);
  });
});

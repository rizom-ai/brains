import { describe, expect, it } from "bun:test";
import { runConcurrentPhase } from "../src/effect-runtime";

describe("runConcurrentPhase", () => {
  it("settles every sibling before preserving the first original failure", async () => {
    const startupError = new Error("identity initialization failed");
    let releaseSibling: () => void = () => {};
    const siblingGate = new Promise<void>((resolve) => {
      releaseSibling = resolve;
    });
    let siblingSettled = false;
    let phaseSettled = false;

    const phase = runConcurrentPhase([
      async (): Promise<void> => {
        throw startupError;
      },
      async (): Promise<void> => {
        await siblingGate;
        siblingSettled = true;
      },
    ]).then(
      () => ({ error: undefined }),
      (error: unknown) => ({ error }),
    );
    void phase.then(() => {
      phaseSettled = true;
    });

    await Promise.resolve();
    expect(phaseSettled).toBe(false);

    releaseSibling();
    const result = await phase;

    expect(siblingSettled).toBe(true);
    expect(result.error).toBe(startupError);
  });
});

import { describe, expect, it, mock } from "bun:test";
import { z } from "@brains/utils/zod";
import { createAINamespace } from "../src/entity/context";
import { createMockShell } from "../src/test/mock-shell";

describe("AI template generation cancellation", () => {
  it("forwards the job signal and validates the returned value", async () => {
    const shell = createMockShell();
    const generate = mock(async () => ({ value: "generated" }));
    shell.generateContent = generate;
    const signal = new AbortController().signal;
    const config = { templateName: "topics:votes", prompt: "source" };
    expect(
      await createAINamespace(shell).generate(
        config,
        z.object({ value: z.string() }),
        signal,
      ),
    ).toEqual({ value: "generated" });
    expect(generate).toHaveBeenCalledWith(config, signal);
  });

  it("does not admit pre-aborted generation", async () => {
    const shell = createMockShell();
    const generate = mock(async () => "unexpected");
    shell.generateContent = generate;
    const reason = new Error("deadline");
    expect(
      await createAINamespace(shell)
        .generate(
          { templateName: "topics:votes", prompt: "source" },
          z.string(),
          AbortSignal.abort(reason),
        )
        .catch((error: unknown) => error),
    ).toBe(reason);
    expect(generate).not.toHaveBeenCalled();
  });
});

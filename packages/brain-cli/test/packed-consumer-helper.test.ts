import { describe, expect, it } from "bun:test";
import { getErrorMessage } from "@brains/utils/error";
import {
  liveEvidenceEnabled,
  runCommand,
  waitForHttpReadiness,
} from "./helpers/packed-consumer";

async function rejectionMessage(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    throw new Error("Expected promise to reject");
  } catch (error) {
    return getErrorMessage(error);
  }
}

describe("packed consumer harness", () => {
  it("captures bounded command diagnostics", async () => {
    const failure = await rejectionMessage(
      runCommand(
        [
          "bun",
          "-e",
          'console.log("packed stdout"); console.error("packed stderr"); process.exit(7)',
        ],
        import.meta.dir,
      ),
    );
    expect(failure).toMatch(/packed stdout[\s\S]*packed stderr/u);

    const timeout = await rejectionMessage(
      runCommand(
        ["bun", "-e", "setInterval(() => undefined, 1000)"],
        import.meta.dir,
        { timeoutMs: 50 },
      ),
    );
    expect(timeout).toContain("Command timed out");
  });

  it("waits for bounded HTTP readiness", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () => Response.json({ status: "ok" }),
    });
    try {
      const response = await waitForHttpReadiness(
        `http://127.0.0.1:${server.port}/health`,
        { timeoutMs: 1_000 },
      );
      expect(await response.json()).toEqual({ status: "ok" });
    } finally {
      await server.stop(true);
    }
  });

  it("isolates provider-backed evidence behind one opt-in flag", () => {
    expect(liveEvidenceEnabled({})).toBeFalse();
    expect(
      liveEvidenceEnabled({ RIZOM_PUBLIC_API_LIVE_EVIDENCE: "1" }),
    ).toBeTrue();
  });
});

import { describe, expect, it } from "bun:test";
import { exerciseReadAdoption } from "./fixtures/turso-thread/read-adoption-exercise";

describe("worker-local SDK backing adoption component", () => {
  it.each(["complete", "cancel", "close-ack", "rollback-ack"] as const)(
    "reserves, adopts and retires the actual backing for %s",
    async (scenario) => {
      const result = await exerciseReadAdoption({ sizeBytes: 65539, scenario });
      expect(result).toMatchObject({
        observedBackingBytes: 65539,
        fixtureAdoptedWithoutFullCopy: true,
        healthy: scenario === "complete" || scenario === "cancel",
        writerCommitted: scenario === "complete",
        hashAfterRollback: scenario === "complete",
        workerJoined: true,
        restored: true,
        sdkPeakAllocationBoundEstablished: false,
        runtimeReplaced: false,
      });
    },
  );
});

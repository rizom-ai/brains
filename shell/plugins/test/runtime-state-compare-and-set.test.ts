import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";

describe("mock runtime state compare-and-set parity", () => {
  it("compares parsed snapshots and stores wire input through detached capabilities", async () => {
    const harness = createPluginHarness();
    try {
      const store = harness
        .getMockShell()
        .getRuntimeState()
        .scoped({
          namespace: "snapshot",
          schema: z.object({
            count: z.string().transform(Number),
            revision: z.number().default(0),
          }),
        });
      await store.set("key", { count: "42" });
      const { compareAndSet } = store;
      expect(Object.isFrozen(store)).toBe(true);
      expect(
        await compareAndSet(
          "key",
          { count: 42, revision: 0 },
          { count: "43", revision: 1 },
        ),
      ).toBe(true);
      expect(await store.get("key")).toEqual({ count: 43, revision: 1 });
      expect(
        await compareAndSet("key", { count: 42, revision: 0 }, { count: "44" }),
      ).toBe(false);
      expect(await store.get("key")).toEqual({ count: 43, revision: 1 });
    } finally {
      await harness.reset();
    }
  });
});

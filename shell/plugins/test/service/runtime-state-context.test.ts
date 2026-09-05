import { createMockShell } from "../../src/test/mock-shell";
import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";

import { createServicePluginContext } from "../../src/service/context";

describe("runtime state plugin context", () => {
  it("exposes namespaced runtime state stores", async () => {
    const context = createServicePluginContext(
      createMockShell(),
      "test-plugin",
    );
    const store = context.runtimeState.scoped({
      namespace: "test-plugin.state",
      schema: z.object({ value: z.string() }),
    });

    await store.set("key", { value: "stored" });

    expect(await store.get("key")).toEqual({ value: "stored" });
  });
});

import { expect, test } from "bun:test";
import { defineRoute } from "../src";
import { z } from "@brains/utils/zod";
import { createRuntimeRoute } from "../src/interface/route-runtime";
import { createPluginHarness } from "../src/test/harness";

test("preview reachability is explicit and does not bypass session security", async () => {
  const harness = createPluginHarness();
  try {
    for (const preview of [undefined, false, true]) {
      const route = createRuntimeRoute(
        defineRoute({
          method: "GET",
          path: "/preview-only",
          ...(preview !== undefined ? { preview } : {}),
          security: { kind: "session" },
          response: z.object({ secret: z.string() }),
          handle: () => ({ secret: "private" }),
        }),
        {
          declarationId: "preview-test",
          permissions: { getUserLevel: () => "public", isAnchor: () => false },
          auth: () => harness.getMockShell().getAuthRegistry(),
        },
      );
      expect(route.preview).toBe(preview);
      const response = await route.handler(
        new Request("https://preview.example/preview-only"),
      );
      expect(response.status).toBe(401);
      expect(await response.text()).not.toContain("private");
    }
  } finally {
    await harness.reset();
  }
});

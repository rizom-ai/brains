import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { defineRoute } from "../src";
import { createRuntimeRoute } from "../src/interface/route-runtime";
import { createPluginHarness } from "../src/test/harness";

describe("declared route socket context", () => {
  it("uses only a detached frozen host snapshot, never forwarding headers", async () => {
    const harness = createPluginHarness();
    try {
      const route = createRuntimeRoute(
        defineRoute({
          method: "GET",
          path: "/socket",
          security: { kind: "public" },
          response: z.unknown(),
          handle: ({ transport }) => ({
            address: transport?.remoteAddress ?? null,
            frozen: transport === undefined || Object.isFrozen(transport),
            keys: Object.keys(transport ?? {}),
          }),
        }),
        {
          declarationId: "socket",
          permissions: { getUserLevel: () => "public", isAnchor: () => false },
          auth: () => harness.getMockShell().getAuthRegistry(),
        },
      );
      const request = new Request("http://localhost/socket", {
        headers: { "X-Forwarded-For": "127.0.0.1", Forwarded: "for=127.0.0.1" },
      });
      expect(await (await route.handler(request)).json()).toEqual({
        address: null,
        frozen: true,
        keys: [],
      });
      const context = {
        remoteAddress: "192.0.2.1",
        privateKey: "not-a-route-capability",
      };
      const pending = route.handler(request, context);
      context.remoteAddress = "127.0.0.1";
      expect(await (await pending).json()).toEqual({
        address: "192.0.2.1",
        frozen: true,
        keys: ["remoteAddress"],
      });
    } finally {
      await harness.reset();
    }
  });
});

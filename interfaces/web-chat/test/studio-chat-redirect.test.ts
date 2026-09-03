import { describe, expect, it } from "bun:test";
import type { RegisteredWebRoute } from "@brains/plugins";
import { resolveStudioChatRedirectPath } from "../src/studio-chat-redirect";

function studioTypesRoute(path: string): RegisteredWebRoute {
  return {
    pluginId: "studio",
    fullPath: path,
    definition: {
      path,
      method: "GET",
      public: true,
      handler: () => new Response(),
    },
  };
}

describe("standalone Chat handoff to native Studio", () => {
  it("derives the configured Studio workspace path from registered capability", () => {
    expect(
      resolveStudioChatRedirectPath(
        [studioTypesRoute("/operator/api/types")],
        new URL("https://brain.test/chat?session=conversation/one&ignored=yes"),
      ),
    ).toBe("/operator/workspaces/web-chat%3Achat?session=conversation%2Fone");
  });

  it("keeps standalone Chat when the native capability route is absent", () => {
    expect(
      resolveStudioChatRedirectPath([], new URL("https://brain.test/chat")),
    ).toBeUndefined();
  });
});

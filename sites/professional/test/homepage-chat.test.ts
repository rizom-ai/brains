import { describe, expect, it } from "bun:test";
import { ASK_BOX_SCRIPT_PATH } from "@brains/contracts";
import {
  homepageChatAvailable,
  type ChatRouteRuntime,
} from "../src/datasources/homepage-chat";

function route(
  overrides: {
    pluginId?: string;
    fullPath?: string;
    public?: boolean;
    preview?: boolean;
  } = {},
): {
  pluginId: string;
  fullPath: string;
  definition: { public: boolean; preview: boolean };
} {
  return {
    pluginId: overrides.pluginId ?? "web-chat",
    fullPath: overrides.fullPath ?? ASK_BOX_SCRIPT_PATH,
    definition: {
      public: overrides.public ?? true,
      preview: overrides.preview ?? true,
    },
  };
}

const runtime = (routes: ReturnType<typeof route>[]): ChatRouteRuntime => ({
  webRoutes: { getRoutes: (): ReturnType<typeof route>[] => routes },
});

describe("homepage chat availability", () => {
  it("offers the chat box where Web Chat serves the shared box boot", () => {
    expect(
      homepageChatAvailable({ publishedOnly: true }, runtime([route()])),
    ).toBe(true);
  });

  it("keeps the door only when guest chat is off", () => {
    expect(homepageChatAvailable({ publishedOnly: true }, runtime([]))).toBe(
      false,
    );
    expect(
      homepageChatAvailable(
        { publishedOnly: true },
        runtime([route({ fullPath: "/ask/assets/guest.js" })]),
      ),
    ).toBe(false);
    expect(
      homepageChatAvailable(
        { publishedOnly: true },
        runtime([route({ pluginId: "someone-else" })]),
      ),
    ).toBe(false);
    expect(
      homepageChatAvailable(
        { publishedOnly: true },
        runtime([route({ public: false })]),
      ),
    ).toBe(false);
  });

  it("offers it in a preview build only where the box boot reaches preview", () => {
    expect(
      homepageChatAvailable(
        { publishedOnly: false },
        runtime([route({ preview: false })]),
      ),
    ).toBe(false);
    expect(
      homepageChatAvailable({ publishedOnly: false }, runtime([route()])),
    ).toBe(true);
  });
});

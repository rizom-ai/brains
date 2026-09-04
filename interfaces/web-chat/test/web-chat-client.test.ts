import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { renderChatPage } from "../src/chat-page";
import {
  createWebChatClient,
  getWebChatApiPath,
  getWebChatApiPaths,
} from "../ui-react/src/web-chat-client";

const originalDocument = globalThis.document;
let windowInstance: Window;

beforeEach(() => {
  windowInstance = new Window();
  Object.assign(globalThis, { document: windowInstance.document });
});

afterEach(() => {
  windowInstance.close();
  Object.assign(globalThis, { document: originalDocument });
});

describe("standalone Web Chat transport bootstrap", () => {
  it("publishes the configured API path without executable configuration", () => {
    const html = renderChatPage({
      apiPath: "/custom/chat-api",
      dashboardHref: "/dashboard",
      sessionHref: "/logout",
    });

    expect(html).toContain(
      'data-web-chat-root data-chat-api-path="/custom/chat-api"',
    );
    expect(html).not.toContain("window.__chatConfig");
  });

  it("configures the public transport from the host-owned root attribute", () => {
    windowInstance.document.body.innerHTML =
      '<main data-web-chat-root data-chat-api-path="/custom/chat-api"></main>';

    expect(getWebChatApiPath()).toBe("/custom/chat-api");
    expect(getWebChatApiPaths().sessions).toBe("/custom/chat-api/sessions");
    expect(createWebChatClient().paths.stream).toBe("/custom/chat-api");
  });
});

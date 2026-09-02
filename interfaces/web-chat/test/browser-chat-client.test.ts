import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { renderChatPage } from "../src/chat-page";
import {
  createWebChatClient,
  getWebChatApiPath,
  getWebChatApiPaths,
} from "../ui-react/src/browser-chat-client";

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
      apiPath: "/custom/browser-chat",
      surfaces: [],
      sessionHref: "/logout",
    });

    expect(html).toContain(
      'data-web-chat-root data-chat-api-path="/custom/browser-chat"',
    );
    expect(html).not.toContain("window.__chatConfig");
  });

  it("configures the public transport from the host-owned root attribute", () => {
    windowInstance.document.body.innerHTML =
      '<main data-web-chat-root data-chat-api-path="/custom/browser-chat"></main>';

    expect(getWebChatApiPath()).toBe("/custom/browser-chat");
    expect(getWebChatApiPaths().sessions).toBe("/custom/browser-chat/sessions");
    expect(createWebChatClient().paths.stream).toBe("/custom/browser-chat");
  });
});

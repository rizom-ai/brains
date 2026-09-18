/** @jsxImportSource react */
import { afterEach, beforeEach, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { AuthAccountSnapshot } from "@brains/auth-service/account-contracts";
import { AccountApp } from "./account-view";
import { AccountClient } from "./account-api";

let windowInstance: Window;
let root: Root;
let requests: number;
const previous = new Map<string, PropertyDescriptor | undefined>();
const snapshot: AuthAccountSnapshot = {
  displayName: "Mira",
  role: "trusted",
  passkeys: [],
  sessions: [],
  connectedChannels: [],
  pluginSettings: [
    {
      id: "mailbox",
      title: "Personal mailbox",
      configured: false,
      revision: null,
      fields: [
        {
          name: "password",
          label: "Password",
          control: "text",
          secret: true,
          required: true,
        },
      ],
    },
  ],
};
beforeEach(() => {
  windowInstance = new Window({ url: "http://brain.test/studio" });
  const globals = {
    window: windowInstance,
    document: windowInstance.document,
    navigator: windowInstance.navigator,
    HTMLElement: windowInstance.HTMLElement,
    HTMLInputElement: windowInstance.HTMLInputElement,
    Element: windowInstance.Element,
    Node: windowInstance.Node,
    Event: windowInstance.Event,
    KeyboardEvent: windowInstance.KeyboardEvent,
    MutationObserver: windowInstance.MutationObserver,
    getComputedStyle: windowInstance.getComputedStyle.bind(windowInstance),
    requestAnimationFrame:
      windowInstance.requestAnimationFrame.bind(windowInstance),
    cancelAnimationFrame:
      windowInstance.cancelAnimationFrame.bind(windowInstance),
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [key, value] of Object.entries(globals)) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  }
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  requests = 0;
});
afterEach(async () => {
  await act(async () => root.unmount());
  windowInstance.close();
  for (const [key, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
  previous.clear();
});
async function select(label: string): Promise<void> {
  const tab = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (node) => node.textContent === label,
  );
  if (!tab) throw Error(`Missing ${label} tab`);
  await act(async () => {
    tab.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
}
it("starts Add passkey on its injected client without losing the method receiver", async () => {
  const client = new AccountClient({
    fetch: async (input, init): Promise<Response> => {
      requests += 1;
      expect(String(input)).toBe("/auth/account/passkeys/options");
      expect(init?.method).toBe("POST");
      expect(init?.credentials).toBe("same-origin");
      // Stop before the browser ceremony; never create a credential in this test.
      return Response.json(
        { error: "Registration unavailable in test" },
        { status: 503 },
      );
    },
  });
  await act(async () =>
    root.render(
      createElement(AccountApp, {
        bootstrap: {
          displayName: "Mira",
          role: "trusted",
          routePath: "/studio/workspaces/studio%3Aaccount",
          studioPath: "/studio",
        },
        initialAccount: snapshot,
        client,
      }),
    ),
  );
  await select("Sign-in & sessions");
  const button = [
    ...document.querySelectorAll<HTMLButtonElement>("button"),
  ].find((node) => node.textContent === "Add passkey");
  if (!button) throw Error("Missing Add passkey action");
  await act(async () => {
    button.click();
  });
  expect(requests).toBe(1);
  expect(document.querySelector('[role="status"]')?.textContent).toBe(
    "Registration unavailable in test",
  );
  expect(document.body.textContent).not.toContain("fetchFn");
  expect(button.disabled).toBe(false);
});

it("keeps unsaved personal settings mounted when changing sections, without requests", async () => {
  const client = new AccountClient({
    fetch: async (): Promise<Response> => {
      requests += 1;
      throw Error("No requests expected");
    },
  });
  await act(async () =>
    root.render(
      createElement(AccountApp, {
        bootstrap: {
          displayName: "Mira",
          role: "trusted",
          routePath: "/studio/workspaces/studio%3Aaccount",
          studioPath: "/studio",
        },
        initialAccount: snapshot,
        client,
      }),
    ),
  );
  await select("Personal settings");
  const input = document.querySelector<HTMLInputElement>(
    "#setting-mailbox-password",
  );
  if (!input) throw Error("Missing personal secret input");
  input.value = "unsaved-test-value";
  await select("Sign-in & sessions");
  expect(input.closest('[role="tabpanel"]')?.hasAttribute("hidden")).toBe(true);
  expect(
    document.querySelectorAll('[role="tabpanel"]:not([hidden])'),
  ).toHaveLength(1);
  await select("Personal settings");
  expect(document.querySelector("#setting-mailbox-password")).toBe(input);
  expect(input.value).toBe("unsaved-test-value");
  expect(input.closest('[role="tabpanel"]')?.hasAttribute("hidden")).toBe(
    false,
  );
  expect(requests).toBe(0);
});

/** @jsxImportSource react */
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
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
let restoreGlobals: RestoreGlobals;
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
  restoreGlobals = installDomGlobals(windowInstance, {
    HTMLInputElement: windowInstance.HTMLInputElement,
    HTMLFormElement: windowInstance.HTMLFormElement,
    FormData: windowInstance.FormData,
    Event: windowInstance.Event,
    CustomEvent: windowInstance.CustomEvent,
    KeyboardEvent: windowInstance.KeyboardEvent,
    MutationObserver: windowInstance.MutationObserver,
    ResizeObserver: windowInstance.ResizeObserver,
    getComputedStyle: windowInstance.getComputedStyle.bind(windowInstance),
    requestAnimationFrame:
      windowInstance.requestAnimationFrame.bind(windowInstance),
    cancelAnimationFrame:
      windowInstance.cancelAnimationFrame.bind(windowInstance),
  });
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  requests = 0;
});
afterEach(async () => {
  await act(async () => root.unmount());
  windowInstance.close();
  restoreGlobals();
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

async function mountAccount(
  account: AuthAccountSnapshot,
  sent: Array<{ path: string; body: unknown }>,
): Promise<void> {
  const client = new AccountClient({
    fetch: async (input, init): Promise<Response> => {
      requests += 1;
      sent.push({
        path: String(input),
        body:
          typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      });
      return Response.json({ account });
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
        initialAccount: account,
        client,
      }),
    ),
  );
}
async function press(label: string): Promise<void> {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")]
    .reverse()
    .find((node) => node.textContent === label);
  if (!button) throw Error(`Missing ${label} button`);
  await act(async () => {
    button.click();
  });
}

it("ends another browser session only once it is confirmed", async () => {
  const sent: Array<{ path: string; body: unknown }> = [];
  await mountAccount(
    {
      ...snapshot,
      sessions: [
        { id: "here", current: true, createdAt: 1, expiresAt: 2 },
        { id: "there", current: false, createdAt: 1, expiresAt: 2 },
      ],
    },
    sent,
  );
  await select("Sign-in & sessions");

  await press("End");
  expect(document.body.textContent).toContain("End this browser session?");
  expect(sent).toEqual([]);

  await press("End session");
  expect(sent).toEqual([
    {
      path: "/auth/account/mutations",
      body: {
        action: "revokeSession",
        confirmation: "revokeSession",
        sessionId: "there",
      },
    },
  ]);
});

it("saves personal settings with checkbox and number values as their types", async () => {
  const sent: Array<{ path: string; body: unknown }> = [];
  await mountAccount(
    {
      ...snapshot,
      pluginSettings: [
        {
          id: "mailbox",
          title: "Personal mailbox",
          configured: false,
          revision: null,
          fields: [
            {
              name: "host",
              label: "Host",
              control: "text",
              secret: false,
              required: true,
            },
            {
              name: "port",
              label: "Port",
              control: "number",
              secret: false,
              required: false,
            },
            {
              name: "tls",
              label: "TLS",
              control: "checkbox",
              secret: false,
              required: false,
            },
          ],
        },
      ],
    },
    sent,
  );
  await select("Personal settings");
  const host = document.querySelector<HTMLInputElement>(
    "#setting-mailbox-host",
  );
  const port = document.querySelector<HTMLInputElement>(
    "#setting-mailbox-port",
  );
  if (!host || !port) throw Error("Missing settings inputs");
  host.value = "imap.test.invalid";
  port.value = "993";

  await act(async () => {
    host
      .closest("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });

  expect(sent).toEqual([
    {
      path: "/auth/account/plugin-settings",
      body: {
        action: "save",
        definitionId: "mailbox",
        values: { host: "imap.test.invalid", port: 993, tls: false },
      },
    },
  ]);
});

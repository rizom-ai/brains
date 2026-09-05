/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { Window } from "happy-dom";
import type { FetchLike } from "@brains/utils/fetch-like";
import { App } from "./App";
import { StudioApi } from "./api";
import { createStudioQueryClient } from "./query-client";
import { StudioApiProvider } from "./studio-api-context";
import { createStudioRouter } from "./studio-router";

let windowInstance: Window;
let root: Root;
let requests: string[];

// Everything the mounted App asks for goes through here, so the requests it
// makes are readable without touching the global fetch.
const recordingFetch: FetchLike = (input) => {
  const url = String(input);
  requests.push(url);
  if (url === "/studio/api/types") {
    return Promise.resolve(
      Response.json({
        types: [{ entityType: "post", label: "Posts", isSingleton: false }],
        workspaces: [],
      }),
    );
  }
  return Promise.resolve(Response.json({}, { status: 404 }));
};

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

async function waitFor(
  predicate: () => boolean,
  attemptsLeft = 20,
): Promise<void> {
  if (predicate()) return;
  if (attemptsLeft === 0) {
    throw new Error(
      `Condition never held; requests seen: ${JSON.stringify(requests)}`,
    );
  }
  await settle();
  return waitFor(predicate, attemptsLeft - 1);
}

beforeEach(() => {
  windowInstance = new Window({ url: "http://brain.test/studio" });
  requests = [];
  Object.assign(globalThis, {
    window: windowInstance,
    document: windowInstance.document,
    localStorage: windowInstance.localStorage,
    navigator: windowInstance.navigator,
    HTMLElement: windowInstance.HTMLElement,
    Element: windowInstance.Element,
    Node: windowInstance.Node,
    Event: windowInstance.Event,
    CustomEvent: windowInstance.CustomEvent,
    MutationObserver: windowInstance.MutationObserver,
    ResizeObserver: windowInstance.ResizeObserver,
    requestAnimationFrame:
      windowInstance.requestAnimationFrame.bind(windowInstance),
    cancelAnimationFrame:
      windowInstance.cancelAnimationFrame.bind(windowInstance),
    getComputedStyle: windowInstance.getComputedStyle.bind(windowInstance),
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  windowInstance.close();
});

describe("Studio App transport", () => {
  it("requests navigation through the provided Studio client", async () => {
    const api = new StudioApi({ basePath: "/studio", fetch: recordingFetch });
    const router = createStudioRouter(
      "/studio",
      App,
      createMemoryHistory({ initialEntries: ["/studio"] }),
    );
    const queryClient = createStudioQueryClient();

    await act(async () => {
      root.render(
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(
            StudioApiProvider,
            { api },
            createElement(RouterProvider, { router }),
          ),
        ),
      );
    });
    // App asks for the "post" collection only because the types the provided
    // client answered with named it, so this follow-up shows the round trip.
    await waitFor(() => requests.includes("/studio/api/entities?type=post"));

    expect(requests[0]).toBe("/studio/api/types");
  });
});

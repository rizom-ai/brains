/** @jsxImportSource react */
import { installDomGlobals } from "@brains/test-utils";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  createMemoryHistory,
  RouterProvider,
  type RouterHistory,
} from "@tanstack/react-router";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { App } from "../../ui-react/src/App";
import type { StudioApi } from "../../ui-react/src/api";
import { StudioApiProvider } from "../../ui-react/src/studio-api-context";
import { createStudioRouter } from "../../ui-react/src/studio-router";
import { createStudioQueryClient } from "../../ui-react/src/query-client";

export interface MountedStudio {
  history: RouterHistory;
  client: QueryClient;
  close(): Promise<void>;
  input(label: string, value: string): Promise<void>;
  click(label: string): Promise<void>;
}

export async function waitForStudio(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (predicate()) return;
    await act(async () => {
      await Bun.sleep(10);
    });
  }
  throw new Error(`Studio did not settle: ${document.body.textContent}`);
}

/** Real App/router/query/editor tree; only the HTTP transport is injected. */
export async function mountStudio(
  api: StudioApi,
  path: string,
  basePath = "/studio",
): Promise<MountedStudio> {
  const window = new Window({ url: `https://studio.test${basePath}` });
  const restore = installDomGlobals(window, {
    localStorage: window.localStorage,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    MutationObserver: window.MutationObserver,
    ResizeObserver: window.ResizeObserver,
    NodeFilter: window.NodeFilter,
    HTMLInputElement: window.HTMLInputElement,
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    getComputedStyle: window.getComputedStyle.bind(window),
  });
  const root = createRoot(
    document.body.appendChild(document.createElement("div")),
  );
  const client = createStudioQueryClient();
  const history = createMemoryHistory({ initialEntries: [path] });
  const router = createStudioRouter(basePath, App, history);
  const close = async (): Promise<void> => {
    await act(async () => root.unmount());
    client.clear();
    await window.happyDOM.abort();
    window.close();
    restore();
  };
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <StudioApiProvider api={api}>
            <RouterProvider router={router} />
          </StudioApiProvider>
        </QueryClientProvider>,
      ),
    );
  } catch (error) {
    await close();
    throw error;
  }
  return {
    history,
    client,
    close,
    input: async (label, value): Promise<void> => {
      const input = document.querySelector<HTMLInputElement>(
        `input[aria-label="${label}"], [role="group"][aria-label="${label}"] input`,
      );
      if (!input) throw new Error(`Missing input ${label}`);
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        )?.set?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    },
    click: async (label): Promise<void> => {
      const scope =
        document.querySelector('[role="alertdialog"], [role="dialog"]') ??
        document;
      const button = [
        ...scope.querySelectorAll<HTMLButtonElement | HTMLInputElement>(
          "button, input[type=checkbox]",
        ),
      ].find(
        (node) =>
          node.getAttribute("aria-label") === label ||
          node.textContent === label,
      );
      if (!button)
        throw new Error(`Missing action ${label}: ${scope.textContent}`);
      await act(async () => button.click());
    },
  };
}

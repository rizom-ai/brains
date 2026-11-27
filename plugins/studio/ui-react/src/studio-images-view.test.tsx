/** @jsxImportSource react */
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { StudioApi } from "./api";
import { createStudioQueryClient } from "./query-client";
import { StudioApiProvider } from "./studio-api-context";
import { StudioImagesView } from "./studio-images-view";

let windowInstance: Window;
let restore: RestoreGlobals;
let root: Root;

beforeEach(() => {
  windowInstance = new Window({ url: "https://studio.test/studio/images" });
  restore = installDomGlobals(windowInstance, {
    HTMLInputElement: windowInstance.HTMLInputElement,
    Event: windowInstance.Event,
  });
  root = createRoot(document.body.appendChild(document.createElement("div")));
});

afterEach(async () => {
  await act(async () => root.unmount());
  await windowInstance.happyDOM.abort();
  windowInstance.close();
  restore();
});

async function settle(check: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (check()) return;
    await act(async () => {
      await Bun.sleep(5);
    });
  }
  throw new Error(`Images did not settle: ${document.body.textContent}`);
}

it("shows the brain's images and opens one to describe it", async () => {
  const requests: string[] = [];
  const api = new StudioApi({
    basePath: "/studio",
    fetch: async (input): Promise<Response> => {
      const url = new URL(String(input), "https://studio.test");
      requests.push(`${url.pathname}${url.search}`);
      if (url.pathname.endsWith("/image-library"))
        return Response.json({
          total: 2,
          images: [
            {
              id: "ledger",
              title: "Ledger",
              alt: "",
              altSource: "fallback",
              updated: "2026-07-03T00:00:00.000Z",
            },
            {
              id: "sensor-wall",
              title: "Sensor wall",
              alt: "Rows of sensors on a brick wall",
              altSource: "owner",
              updated: "2026-07-01T00:00:00.000Z",
            },
          ],
        });
      if (url.pathname.endsWith("/image-details"))
        return Response.json({
          id: "ledger",
          title: "Ledger",
          alt: "",
          altSource: "fallback",
          contentHash: "hash",
        });
      return new Response(new Uint8Array([1]), {
        headers: { "Content-Type": "image/png" },
      });
    },
  });
  await act(async () =>
    root.render(
      <QueryClientProvider client={createStudioQueryClient()}>
        <StudioApiProvider api={api}>
          <StudioImagesView />
        </StudioApiProvider>
      </QueryClientProvider>,
    ),
  );
  await settle(
    () => document.querySelectorAll("[data-studio-image]").length === 2,
  );
  expect(document.querySelector("h1")?.textContent).toBe("Images");
  expect(document.body.textContent).toContain("2 images");
  // Thumbnails are asked for small.
  expect(requests.filter((request) => request.includes("/images?"))).toEqual([
    "/studio/api/images?id=ledger&width=160",
    "/studio/api/images?id=sensor-wall&width=160",
  ]);
  const ledger = document.querySelector<HTMLButtonElement>(
    '[data-studio-image="ledger"]',
  );
  // An image without alt text says so, so it can be described.
  expect(ledger?.textContent).toContain("No alt text");
  expect(
    document.querySelector('[data-studio-image="sensor-wall"]')?.textContent,
  ).not.toContain("No alt text");
  await act(async () => ledger?.click());
  expect(ledger?.getAttribute("aria-pressed")).toBe("true");
  await settle(() =>
    requests.some((request) => request.includes("/image-details?id=ledger")),
  );
  await settle(
    () => document.querySelector("[data-studio-image-details]") !== null,
  );
});

it("uploads an image and opens it to describe", async () => {
  const requests: string[] = [];
  let uploaded = false;
  const api = new StudioApi({
    basePath: "/studio",
    fetch: async (input, init): Promise<Response> => {
      const url = new URL(String(input), "https://studio.test");
      requests.push(`${init?.method ?? "GET"} ${url.pathname}`);
      if (url.pathname.endsWith("/upload")) {
        uploaded = true;
        return Response.json({ entityId: "harbor" });
      }
      if (url.pathname.endsWith("/image-library"))
        return Response.json({
          total: uploaded ? 1 : 0,
          images: uploaded
            ? [
                {
                  id: "harbor",
                  title: "Harbor",
                  alt: "",
                  altSource: "fallback",
                  updated: "2026-07-04T00:00:00.000Z",
                },
              ]
            : [],
        });
      if (url.pathname.endsWith("/image-details"))
        return Response.json({
          id: "harbor",
          title: "Harbor",
          alt: "",
          altSource: "fallback",
          contentHash: "hash",
        });
      return new Response(new Uint8Array([1]), {
        headers: { "Content-Type": "image/png" },
      });
    },
  });
  await act(async () =>
    root.render(
      <QueryClientProvider client={createStudioQueryClient()}>
        <StudioApiProvider api={api}>
          <StudioImagesView />
        </StudioApiProvider>
      </QueryClientProvider>,
    ),
  );
  await settle(() => document.body.textContent.includes("0 images"));
  const input = document.querySelector<HTMLInputElement>(
    'input[type="file"][aria-label="Upload image"]',
  );
  if (!input) throw new Error("Missing upload");
  const file = new windowInstance.File([new Uint8Array([1])], "harbor.png", {
    type: "image/png",
  });
  Object.defineProperty(input, "files", { value: [file] });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle(
    () => document.querySelector('[data-studio-image="harbor"]') !== null,
  );
  expect(requests).toContain("POST /studio/api/upload");
  // The new image is open, ready to describe.
  expect(
    document
      .querySelector('[data-studio-image="harbor"]')
      ?.getAttribute("aria-pressed"),
  ).toBe("true");
  await settle(
    () => document.querySelector("[data-studio-image-details]") !== null,
  );
});

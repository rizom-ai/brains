/** @jsxImportSource react */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Window } from "happy-dom";
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import { StudioApi } from "./api";
import { StudioApiProvider } from "./studio-api-context";
import { StudioImageDetails } from "./studio-image-details";

let window: Window;
let restore: RestoreGlobals;
let root: Root;
beforeEach(() => {
  window = new Window();
  restore = installDomGlobals(window, { Event: window.Event });
  root = createRoot(document.body.appendChild(document.createElement("div")));
});
afterEach(async () => {
  await act(async () => root.unmount());
  await window.happyDOM.abort();
  window.close();
  restore();
});

async function settle(check: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (check()) return;
    await act(async () => {
      await Bun.sleep(5);
    });
  }
  throw new Error(`Did not settle: ${document.body.textContent}`);
}

function control<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(
    `[data-studio-image-details] ${selector}`,
  );
  if (!found) throw new Error(`No ${selector}`);
  return found;
}

const titleField = (): HTMLInputElement => control<HTMLInputElement>("input");
const altField = (): HTMLTextAreaElement =>
  control<HTMLTextAreaElement>("textarea");

test("edits an image's title and alt text, which then reads as the owner's", async () => {
  const saved: unknown[] = [];
  const api = new StudioApi({
    basePath: "/studio",
    fetch: async (url, init): Promise<Response> => {
      const path = new URL(String(url), "https://studio.test").pathname;
      if (path === "/studio/api/images")
        return new Response("png", {
          headers: { "Content-Type": "image/png" },
        });
      if (init?.method === "PUT") {
        saved.push(JSON.parse(String(init.body)));
        return Response.json({ entityId: "harbor", skipped: false });
      }
      return Response.json({
        id: "harbor",
        title: "Harbor",
        alt: "Fishing boats moored at dawn",
        altSource: saved.length > 0 ? "owner" : "generated",
        contentHash: "v1",
      });
    },
  });
  await act(async () =>
    root.render(
      <StudioApiProvider api={api}>
        <StudioImageDetails imageId="harbor" />
      </StudioApiProvider>,
    ),
  );
  await settle(() => document.body.textContent.includes("vision model"));
  expect(titleField().value).toBe("Harbor");
  expect(altField().value).toBe("Fishing boats moored at dawn");

  await act(async () => {
    Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )?.set?.call(altField(), "Our harbor, the morning we left");
    altField().dispatchEvent(new Event("input", { bubbles: true }));
  });
  const save = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === "Save image details",
  );
  await act(async () => save?.click());
  await settle(() => document.body.textContent.includes("Written by you"));

  expect(saved).toEqual([
    {
      id: "harbor",
      title: "Harbor",
      alt: "Our harbor, the morning we left",
      baseContentHash: "v1",
    },
  ]);
});

test("names the entries that use an image, as links to them", async () => {
  const detailsWith = (usedIn: unknown[]): StudioApi =>
    new StudioApi({
      basePath: "/studio",
      fetch: async (url): Promise<Response> => {
        const path = new URL(String(url), "https://studio.test").pathname;
        if (path === "/studio/api/images")
          return new Response("png", {
            headers: { "Content-Type": "image/png" },
          });
        return Response.json({
          id: "harbor",
          title: "Harbor",
          alt: "",
          altSource: "fallback",
          contentHash: "v1",
          usedIn,
        });
      },
    });
  await act(async () =>
    root.render(
      <StudioApiProvider
        api={detailsWith([
          { entityType: "post", id: "harbor-essay", title: "Harbor essay" },
        ])}
      >
        <StudioImageDetails imageId="harbor" />
      </StudioApiProvider>,
    ),
  );
  await settle(() => document.body.textContent.includes("Used in"));
  const link = document.querySelector<HTMLAnchorElement>(
    "[data-studio-image-uses] a",
  );
  expect(link?.textContent).toBe("Harbor essay");
  expect(link?.getAttribute("href")).toBe("/studio/entities/post/harbor-essay");

  await act(async () =>
    root.render(
      <StudioApiProvider api={detailsWith([])}>
        <StudioImageDetails imageId="harbor" />
      </StudioApiProvider>,
    ),
  );
  await settle(() =>
    document.body.textContent.includes("Not used in any entry yet."),
  );
  expect(document.querySelector("[data-studio-image-uses] a")).toBeNull();
});

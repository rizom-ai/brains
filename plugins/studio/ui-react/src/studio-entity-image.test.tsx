/** @jsxImportSource react */
import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Window } from "happy-dom";
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import { StudioApi } from "./api";
import { StudioApiProvider } from "./studio-api-context";
import { StudioMarkdown } from "./studio-markdown";

let window: Window;
let restore: RestoreGlobals;
let root: Root;
const pngBytes = Buffer.from("preview-fixture");
beforeEach(() => {
  window = new Window();
  restore = installDomGlobals(window);
  root = createRoot(document.body.appendChild(document.createElement("div")));
});
afterEach(async () => {
  await act(async () => root.unmount());
  await window.happyDOM.abort();
  window.close();
  restore();
});
function imageResponse(
  body: BodyInit = pngBytes,
  type = "image/png",
): Response {
  return new Response(body, { headers: { "Content-Type": type } });
}

function previewSource(): string | null | undefined {
  return document.querySelector("img")?.getAttribute("src");
}
async function render(api: StudioApi, source: string): Promise<void> {
  await act(async () =>
    root.render(
      <StudioApiProvider api={api}>
        <StudioMarkdown presentation="document">{source}</StudioMarkdown>
      </StudioApiProvider>,
    ),
  );
  await act(async () => {
    await Bun.sleep(20);
  });
}

async function settle(check: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (check()) return;
    await act(async () => {
      await Bun.sleep(5);
    });
  }
  throw new Error(`Preview did not settle: ${document.body.textContent}`);
}

test("preview resolves an opaque image reference through its injected mount", async () => {
  const calls: string[] = [];
  const api = new StudioApi({
    basePath: "/authoring",
    fetch: async (url): Promise<Response> => {
      calls.push(String(url));
      return imageResponse();
    },
  });
  const source = "![Body](entity://image/ref%2Fopaque)";
  await render(api, source);
  await settle(() => previewSource()?.startsWith("blob:") === true);
  expect(calls).toHaveLength(1);
  const url = new URL(calls[0] ?? "", "https://studio.test");
  expect(url.pathname).toBe("/authoring/api/images");
  expect(url.searchParams.get("id")).toBe("ref%2Fopaque");
  expect(document.querySelector("img")?.alt).toBe("Body");
});

test("a changed API/session never displays or completes the previous session's image", async () => {
  let finish: ((response: Response) => void) | undefined;
  let signal: AbortSignal | null | undefined;
  const pending = new StudioApi({
    basePath: "/authoring",
    fetch: (_url, init): Promise<Response> => {
      signal = init?.signal;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  });
  const denied = new StudioApi({
    basePath: "/authoring",
    fetch: async (): Promise<Response> =>
      Response.json({ error: "Not found" }, { status: 404 }),
  });
  const allowed = new StudioApi({
    basePath: "/authoring",
    fetch: async (): Promise<Response> => imageResponse(),
  });
  await render(allowed, "![Private](entity://image/reference)");
  await settle(() => previewSource()?.startsWith("blob:") === true);
  await render(pending, "![Private](entity://image/reference)");
  expect(document.querySelector("img")).toBeNull();
  expect(finish).toBeDefined();
  await render(denied, "![Private](entity://image/reference)");
  await settle(() => document.body.textContent.includes("Image unavailable"));
  expect(signal?.aborted).toBe(true);
  const complete = finish;
  if (!complete) throw new Error("Missing pending read");
  await act(async () => {
    complete(imageResponse());
  });
  expect(document.querySelector("img")).toBeNull();
  expect(document.body.textContent).toContain("Image unavailable");
});

test("non-image content is not used as a preview URL and unsafe links remain blocked", async () => {
  let calls = 0;
  const api = new StudioApi({
    basePath: "/authoring",
    fetch: async (): Promise<Response> => {
      calls++;
      return imageResponse("alert(1)", "text/javascript");
    },
  });
  await render(
    api,
    "![Bad](entity://image/reference)\n\n[Unsafe](javascript:alert(1))",
  );
  await settle(() => document.body.textContent.includes("Image unavailable"));
  expect(document.querySelector("img")).toBeNull();
  expect(document.body.textContent).toContain("Image unavailable");
  expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
  expect(calls).toBe(1);
});

test("image references in code examples remain literal and trigger no reads", async () => {
  let calls = 0;
  const api = new StudioApi({
    basePath: "/authoring",
    fetch: async (): Promise<Response> => {
      calls++;
      return imageResponse();
    },
  });
  await render(
    api,
    "```md\n![Example](entity://image/reference)\n```\n\n`![Inline](entity://image/reference)`",
  );
  expect(document.body.textContent).toContain(
    "![Example](entity://image/reference)",
  );
  expect(document.body.textContent).toContain(
    "![Inline](entity://image/reference)",
  );
  expect(document.body.textContent).not.toContain(
    "studio-entity-image.invalid",
  );
  expect(calls).toBe(0);
});

test("a preview's object URL is released when it is no longer shown", async () => {
  const revoke = spyOn(URL, "revokeObjectURL");
  const api = new StudioApi({
    basePath: "/authoring",
    fetch: async (): Promise<Response> => imageResponse(),
  });
  await render(api, "![Cover](entity://image/cover)");
  await settle(() => previewSource()?.startsWith("blob:") === true);
  const shown = previewSource();

  await render(api, "No image any more.");

  expect(revoke).toHaveBeenCalledWith(shown);
  revoke.mockRestore();
});

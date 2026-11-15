/** @jsxImportSource react */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Field } from "./entity-fields";

let windowInstance: Window;
let restore: RestoreGlobals;
let root: Root;

beforeEach(() => {
  windowInstance = new Window();
  restore = installDomGlobals(windowInstance, { Event: windowInstance.Event });
  root = createRoot(document.body.appendChild(document.createElement("div")));
});

afterEach(async () => {
  await act(async () => root.unmount());
  await windowInstance.happyDOM.abort();
  windowInstance.close();
  restore();
});

test("offers only the raster formats images are stored as", async () => {
  await act(async () =>
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <Field
          descriptor={{ name: "coverImageId", label: "Cover", widget: "image" }}
          value=""
          onChange={(): void => {}}
        />
      </QueryClientProvider>,
    ),
  );

  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  expect(input?.accept).toBe("image/png,image/jpeg,image/gif,image/webp");
  const text = document.body.textContent;
  expect(text).toContain("PNG, JPEG, GIF or WebP");
  expect(text).not.toContain("SVG");
  expect(text).not.toContain("AVIF");
});

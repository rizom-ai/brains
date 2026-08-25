import { expect, it } from "bun:test";
import { createWebViewBrowserFactory, renderPdf, screenshotPng } from "../src";

const chromePath = process.env["BUN_WEBVIEW_TEST_CHROME_PATH"];

it.skipIf(!chromePath)(
  "renders PNG and PDF through WebView after network idle",
  async () => {
    if (!chromePath) throw new Error("WebView test Chrome path is missing");
    let slowRequestCompleted = false;
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === "/slow") {
          await Bun.sleep(100);
          slowRequestCompleted = true;
          return new Response("done");
        }
        return new Response(
          `<!doctype html><html><body><h1>Bun WebView</h1><script>fetch('/slow').then(() => document.body.dataset.ready = 'true')</script></body></html>`,
          { headers: { "content-type": "text/html" } },
        );
      },
    });
    const factory = createWebViewBrowserFactory({
      executablePath: chromePath,
      args: ["--no-sandbox"],
    });

    try {
      const png = await screenshotPng(
        `${server.url.origin}/`,
        { width: 640, height: 360 },
        { browserFactory: factory },
      );
      expect(png.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      expect(slowRequestCompleted).toBe(true);

      const pdf = await renderPdf(`${server.url.origin}/`, {
        browserFactory: factory,
        format: "A4",
      });
      expect(pdf.subarray(0, 4).toString("ascii")).toBe("%PDF");
    } finally {
      await server.stop(true);
      Bun.WebView.closeAll();
    }
  },
  20_000,
);

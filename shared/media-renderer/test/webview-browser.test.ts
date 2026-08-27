import { expect, it } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { basename } from "node:path";
import { renderPdf, screenshotPng } from "../src";

const chromePath = process.env["BUN_WEBVIEW_TEST_CHROME_PATH"];

it.skipIf(!chromePath)(
  "replaces Playwright for concurrent PNG and PDF rendering",
  async () => {
    if (!chromePath) throw new Error("WebView test Chrome path is missing");
    const originalChromePath = process.env["BUN_CHROME_PATH"];
    process.env["BUN_CHROME_PATH"] = chromePath;
    let slowRequestCount = 0;
    let releaseFirstRequest: (() => void) | undefined;
    let signalFirstRequest: (() => void) | undefined;
    const firstRequestStarted = new Promise<void>((resolve) => {
      signalFirstRequest = resolve;
    });
    let releaseHangingRequest: (() => void) | undefined;
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === "/slow") {
          slowRequestCount++;
          if (slowRequestCount === 1) {
            signalFirstRequest?.();
            return new Promise<Response>((resolve) => {
              releaseFirstRequest = (): void => resolve(new Response("done"));
            });
          }
          return new Response("done");
        }
        if (url.pathname === "/never") {
          return new Promise<Response>((resolve) => {
            releaseHangingRequest = (): void =>
              resolve(new Response("released"));
          });
        }
        if (url.pathname === "/tall") {
          return new Response(
            "<!doctype html><style>html,body{margin:0}body{height:1400px;background:#b44}</style>",
            { headers: { "content-type": "text/html" } },
          );
        }
        const requestPath = url.searchParams.get("hang") ? "/never" : "/slow";
        return new Response(
          `<!doctype html><html><body><h1>Bun WebView</h1><script>fetch('${requestPath}').then(() => document.body.dataset.ready = 'true')</script></body></html>`,
          { headers: { "content-type": "text/html" } },
        );
      },
    });

    try {
      const firstScreenshot = screenshotPng(server.url.origin, {
        width: 640,
        height: 360,
      });
      await firstRequestStarted;
      releaseFirstRequest?.();
      releaseFirstRequest = undefined;
      const png = await firstScreenshot;
      expect(png.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      expect(slowRequestCount).toBe(1);

      const pdf = await renderPdf(server.url.origin, { format: "A4" });
      expect(pdf.subarray(0, 4).toString("ascii")).toBe("%PDF");
      expect(slowRequestCount).toBe(2);

      const fullPage = await screenshotPng(
        `${server.url.origin}/tall`,
        { width: 640, height: 360 },
        { fullPage: true, waitUntil: "load" },
      );
      expect(readPngDimensions(fullPage)).toEqual({ width: 640, height: 1400 });

      const concurrent = await Promise.all(
        Array.from({ length: 8 }, (_, index) =>
          index % 2 === 0
            ? screenshotPng(server.url.origin, { width: 320, height: 180 })
            : renderPdf(server.url.origin, { format: "Letter" }),
        ),
      );
      expect(concurrent.every((output) => output.length > 100)).toBe(true);
      expect(slowRequestCount).toBe(10);

      let timeoutError: unknown;
      try {
        await screenshotPng(
          `${server.url.origin}?hang=1`,
          { width: 320, height: 180 },
          { timeoutMs: 100 },
        );
      } catch (error) {
        timeoutError = error;
      }
      expect(timeoutError).toMatchObject({ code: "render-timeout" });
      releaseHangingRequest?.();
      releaseHangingRequest = undefined;

      const recovered = await screenshotPng(
        server.url.origin,
        { width: 320, height: 180 },
        { waitUntil: "load" },
      );
      expect(recovered.subarray(0, 4)).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      );

      let formatError: unknown;
      try {
        await renderPdf(server.url.origin, {
          format: "not-a-paper-size",
          waitUntil: "load",
        });
      } catch (error) {
        formatError = error;
      }
      expect(formatError).toBeInstanceOf(Error);
      expect(formatError).toHaveProperty(
        "message",
        "Unsupported PDF format: not-a-paper-size",
      );

      await waitForNoChromiumProcesses(basename(chromePath));
    } finally {
      releaseFirstRequest?.();
      releaseHangingRequest?.();
      Bun.WebView.closeAll();
      await server.stop(true);
      if (originalChromePath === undefined) {
        delete process.env["BUN_CHROME_PATH"];
      } else {
        process.env["BUN_CHROME_PATH"] = originalChromePath;
      }
    }
  },
  30_000,
);

function readPngDimensions(png: Buffer): { width: number; height: number } {
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}

async function waitForNoChromiumProcesses(
  executableName: string,
): Promise<void> {
  const deadline = performance.now() + 2_000;
  while (performance.now() < deadline) {
    if ((await chromiumProcessCount(executableName)) === 0) return;
    await Bun.sleep(10);
  }
  expect(await chromiumProcessCount(executableName)).toBe(0);
}

async function chromiumProcessCount(executableName: string): Promise<number> {
  const processIds = (await readdir("/proc")).filter((entry) =>
    /^\d+$/u.test(entry),
  );
  let count = 0;
  await Promise.all(
    processIds.map(async (processId) => {
      try {
        const command = await readFile(`/proc/${processId}/cmdline`, "utf8");
        if (command.includes(executableName)) count++;
      } catch {
        // Process exited between listing and inspection.
      }
    }),
  );
  return count;
}

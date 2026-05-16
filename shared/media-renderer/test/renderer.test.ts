import { describe, expect, it } from "bun:test";
import {
  MediaRenderError,
  renderPdf,
  screenshotPng,
  type BrowserFactory,
  type MediaBrowser,
  type MediaPage,
  type ViewportOptions,
} from "../src";

const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pdfBuffer = Buffer.from("%PDF-1.7\n%test");

class FakePage implements MediaPage {
  public gotoCalls: Array<{
    url: string;
    options: {
      waitUntil: "load" | "domcontentloaded" | "networkidle";
      timeout: number;
    };
  }> = [];
  public closed = false;

  constructor(
    private readonly screenshotData: Buffer = pngBuffer,
    private readonly pdfData: Buffer = pdfBuffer,
  ) {}

  async goto(
    url: string,
    options: {
      waitUntil: "load" | "domcontentloaded" | "networkidle";
      timeout: number;
    },
  ): Promise<void> {
    this.gotoCalls.push({ url, options });
  }

  async screenshot(): Promise<Buffer> {
    return this.screenshotData;
  }

  async pdf(): Promise<Buffer> {
    return this.pdfData;
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

class FakeBrowser implements MediaBrowser {
  public closeCalls = 0;
  public closed = false;
  public receivedViewport: ViewportOptions | undefined;

  constructor(
    public readonly page: FakePage,
    private readonly closeBehavior: "ok" | "throw" = "ok",
  ) {}

  async newPage(options?: { viewport?: ViewportOptions }): Promise<MediaPage> {
    this.receivedViewport = options?.viewport;
    return this.page;
  }

  async close(): Promise<void> {
    this.closeCalls++;
    this.closed = true;
    if (this.closeBehavior === "throw") {
      throw new Error("browser already closed");
    }
  }
}

function fakeFactory(browser: FakeBrowser): BrowserFactory {
  return {
    async launch(): Promise<MediaBrowser> {
      return browser;
    },
  };
}

describe("media renderer", () => {
  it("captures a PNG screenshot with the requested viewport", async () => {
    const page = new FakePage();
    const browser = new FakeBrowser(page);

    const result = await screenshotPng(
      "http://localhost/_media/og/example",
      { width: 1200, height: 630 },
      { browserFactory: fakeFactory(browser), waitUntil: "load" },
    );

    expect(result).toEqual(pngBuffer);
    expect(browser.receivedViewport).toEqual({ width: 1200, height: 630 });
    expect(page.gotoCalls).toEqual([
      {
        url: "http://localhost/_media/og/example",
        options: { waitUntil: "load", timeout: 30_000 },
      },
    ]);
    expect(page.closed).toBe(true);
    expect(browser.closed).toBe(true);
  });

  it("renders a PDF and enforces maxBytes", async () => {
    const page = new FakePage(pngBuffer, pdfBuffer);
    const browser = new FakeBrowser(page);

    try {
      await renderPdf("http://localhost/_media/carousel/example", {
        browserFactory: fakeFactory(browser),
        maxBytes: 4,
      });
      throw new Error("Expected renderPdf to reject");
    } catch (error) {
      expect(error).toMatchObject({ code: "output-too-large" });
    }

    expect(page.closed).toBe(true);
    expect(browser.closed).toBe(true);
  });

  it("closes the browser only once when a timeout fires", async () => {
    class SlowPage extends FakePage {
      override async goto(): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    const page = new SlowPage();
    const browser = new FakeBrowser(page);

    try {
      await renderPdf("http://localhost/_media/carousel/slow", {
        browserFactory: fakeFactory(browser),
        timeoutMs: 10,
      });
      throw new Error("Expected renderPdf to reject");
    } catch (error) {
      expect(error).toMatchObject({ code: "render-timeout" });
    }

    // Allow any straggling microtasks scheduled by Promise.race to settle.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(browser.closeCalls).toBe(1);
  });

  it("rejects invalid PDF output", async () => {
    const page = new FakePage(pngBuffer, Buffer.from("not a pdf"));
    const browser = new FakeBrowser(page);

    try {
      await renderPdf("http://localhost/_media/carousel/example", {
        browserFactory: fakeFactory(browser),
      });
      throw new Error("Expected renderPdf to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(MediaRenderError);
    }
  });
});

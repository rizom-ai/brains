import { getErrorMessage } from "@brains/utils/error";
import type {
  BrowserFactory,
  MediaBrowser,
  MediaPage,
  ViewportOptions,
  WaitUntilState,
} from "./browser-types";
import { MediaRenderError } from "./media-render-error";

const NETWORK_IDLE_MS = 500;
const NETWORK_POLL_MS = 10;
const CSS_PIXELS_PER_INCH = 96;
const PDF_FORMAT_DIMENSIONS: Readonly<
  Record<string, { paperWidth: number; paperHeight: number }>
> = {
  a0: { paperWidth: 33.1, paperHeight: 46.8 },
  a1: { paperWidth: 23.4, paperHeight: 33.1 },
  a2: { paperWidth: 16.54, paperHeight: 23.4 },
  a3: { paperWidth: 11.7, paperHeight: 16.5 },
  a4: { paperWidth: 8.2677, paperHeight: 11.6929 },
  a5: { paperWidth: 5.83, paperHeight: 8.27 },
  a6: { paperWidth: 4.13, paperHeight: 5.83 },
  legal: { paperWidth: 8.5, paperHeight: 14 },
  ledger: { paperWidth: 17, paperHeight: 11 },
  letter: { paperWidth: 8.5, paperHeight: 11 },
  tabloid: { paperWidth: 11, paperHeight: 17 },
};

let activeBrowserLeases = 0;
let scheduledBrowserShutdown: ReturnType<typeof setTimeout> | undefined;
let browserShutdown: Promise<void> | undefined;

export interface BrowserLaunchOptions {
  executablePath?: string;
  args?: string[];
}

interface PrintToPdfResult {
  data: string;
}

interface CaptureScreenshotResult {
  data: string;
}

interface LayoutMetricsResult {
  cssContentSize?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface NetworkRequestEvent {
  requestId: string;
}

/** Bun 1.4 WebView adapter for the renderer's browser seam. */
export function createChromiumBrowserFactory(
  options: BrowserLaunchOptions = {},
): BrowserFactory {
  return {
    async launch(): Promise<MediaBrowser> {
      const browser = new WebViewMediaBrowser(options);
      try {
        await browser.initialize();
        return browser;
      } catch (error) {
        await browser.close().catch(() => undefined);
        throw new MediaRenderError(
          `Failed to launch Bun.WebView for media rendering: ${getErrorMessage(error)}`,
          "browser-launch-failed",
        );
      }
    },
  };
}

async function acquireBrowserLease(): Promise<void> {
  if (scheduledBrowserShutdown !== undefined) {
    clearTimeout(scheduledBrowserShutdown);
    scheduledBrowserShutdown = undefined;
  }
  if (browserShutdown) await browserShutdown;
  activeBrowserLeases++;
}

function scheduleBrowserShutdown(): void {
  if (scheduledBrowserShutdown !== undefined || browserShutdown) return;
  // Let a back-to-back render reuse Chrome. If the event loop reaches the
  // timer with no new lease, every media-owned view has closed and WebView's
  // process-global browser can be reclaimed without disrupting concurrency.
  scheduledBrowserShutdown = setTimeout(() => {
    scheduledBrowserShutdown = undefined;
    Bun.WebView.closeAll();
    const shutdown = new Promise<void>((resolve) => setTimeout(resolve, 0));
    browserShutdown = shutdown;
    void shutdown.then(() => {
      if (browserShutdown === shutdown) browserShutdown = undefined;
    });
  }, 0);
}

class WebViewMediaBrowser implements MediaBrowser {
  private readonly options: BrowserLaunchOptions;
  private readonly pages = new Set<WebViewMediaPage>();
  private initialView: Bun.WebView | undefined;
  private leased = false;

  constructor(options: BrowserLaunchOptions) {
    this.options = options;
  }

  public async initialize(): Promise<void> {
    await acquireBrowserLease();
    this.leased = true;
    const view = this.createView({ width: 800, height: 600 });
    this.initialView = view;
    await view.navigate("about:blank");
  }

  public async newPage(options?: {
    viewport?: ViewportOptions;
  }): Promise<MediaPage> {
    const viewport = options?.viewport ?? { width: 800, height: 600 };
    const view = this.initialView ?? this.createView(viewport);
    this.initialView = undefined;
    const page = new WebViewMediaPage(view, viewport, () => {
      this.pages.delete(page);
    });
    this.pages.add(page);
    await page.initialize();
    return page;
  }

  public async close(): Promise<void> {
    try {
      this.initialView?.close();
      this.initialView = undefined;
      const pages = [...this.pages];
      this.pages.clear();
      await Promise.all(pages.map((page) => page.close()));
    } finally {
      this.releaseLease();
    }
  }

  private createView(viewport: ViewportOptions): Bun.WebView {
    const args = [...(this.options.args ?? [])];
    if (process.getuid?.() === 0 && !args.includes("--no-sandbox")) {
      args.push("--no-sandbox");
    }
    const backend: Bun.WebView.Backend = {
      type: "chrome",
      url: false,
      ...(this.options.executablePath
        ? { path: this.options.executablePath }
        : {}),
      ...(args.length > 0 ? { argv: args } : {}),
    };
    return new Bun.WebView({
      width: viewport.width,
      height: viewport.height,
      backend,
    });
  }

  private releaseLease(): void {
    if (!this.leased) return;
    this.leased = false;
    activeBrowserLeases--;
    if (activeBrowserLeases === 0) scheduleBrowserShutdown();
  }
}

class WebViewMediaPage implements MediaPage {
  private readonly view: Bun.WebView;
  private readonly viewport: ViewportOptions;
  private readonly onClose: () => void;
  private readonly activeRequests = new Set<string>();
  private lastNetworkActivity = performance.now();
  private networkEnabled = false;
  private closed = false;

  constructor(
    view: Bun.WebView,
    viewport: ViewportOptions,
    onClose: () => void,
  ) {
    this.view = view;
    this.viewport = viewport;
    this.onClose = onClose;
  }

  public async initialize(): Promise<void> {
    await this.view.cdp("Emulation.setDeviceMetricsOverride", {
      width: this.viewport.width,
      height: this.viewport.height,
      deviceScaleFactor: this.viewport.deviceScaleFactor ?? 1,
      mobile: false,
    });
  }

  public async goto(
    url: string,
    options: { waitUntil: WaitUntilState; timeout: number },
  ): Promise<void> {
    if (options.waitUntil === "networkidle") await this.enableNetworkTracking();
    await withTimeout(
      this.view.navigate(url),
      options.timeout,
      `WebView navigation to ${url}`,
    );
    if (options.waitUntil === "networkidle") {
      await withTimeout(
        this.waitForNetworkIdle(),
        options.timeout,
        `WebView network idle for ${url}`,
      );
    }
  }

  public async screenshot(options: {
    type: "png";
    fullPage?: boolean;
    omitBackground?: boolean;
  }): Promise<Buffer> {
    if (options.omitBackground) {
      await this.view.cdp("Emulation.setDefaultBackgroundColorOverride", {
        color: { r: 0, g: 0, b: 0, a: 0 },
      });
    }
    try {
      const clip = options.fullPage ? await this.fullPageClip() : undefined;
      const result = await this.view.cdp<CaptureScreenshotResult>(
        "Page.captureScreenshot",
        {
          format: "png",
          fromSurface: true,
          captureBeyondViewport: options.fullPage ?? false,
          ...(clip ? { clip } : {}),
        },
      );
      return Buffer.from(result.data, "base64");
    } finally {
      if (options.omitBackground) {
        await this.view.cdp("Emulation.setDefaultBackgroundColorOverride", {});
      }
    }
  }

  public async pdf(options: Parameters<MediaPage["pdf"]>[0]): Promise<Buffer> {
    const dimensions = pdfDimensions(options);
    const result = await this.view.cdp<PrintToPdfResult>("Page.printToPDF", {
      printBackground: options.printBackground ?? true,
      preferCSSPageSize: options.preferCSSPageSize ?? true,
      ...dimensions,
      ...(options.margin?.top !== undefined
        ? { marginTop: toInches(options.margin.top) }
        : {}),
      ...(options.margin?.right !== undefined
        ? { marginRight: toInches(options.margin.right) }
        : {}),
      ...(options.margin?.bottom !== undefined
        ? { marginBottom: toInches(options.margin.bottom) }
        : {}),
      ...(options.margin?.left !== undefined
        ? { marginLeft: toInches(options.margin.left) }
        : {}),
    });
    return Buffer.from(result.data, "base64");
  }

  public async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.view.close();
    this.onClose();
  }

  private async enableNetworkTracking(): Promise<void> {
    if (this.networkEnabled) return;
    this.networkEnabled = true;
    await this.view.cdp("Network.enable");
    this.view.addEventListener("Network.requestWillBeSent", (event: Event) => {
      const request = networkRequestFromEvent(event);
      if (!request) return;
      this.activeRequests.add(request.requestId);
      this.lastNetworkActivity = performance.now();
    });
    const finish = (event: Event): void => {
      const request = networkRequestFromEvent(event);
      if (!request) return;
      this.activeRequests.delete(request.requestId);
      this.lastNetworkActivity = performance.now();
    };
    this.view.addEventListener("Network.loadingFinished", finish);
    this.view.addEventListener("Network.loadingFailed", finish);
  }

  private async waitForNetworkIdle(): Promise<void> {
    if (this.closed)
      throw new Error("WebView closed while waiting for network idle");
    if (
      this.activeRequests.size === 0 &&
      performance.now() - this.lastNetworkActivity >= NETWORK_IDLE_MS
    ) {
      return;
    }
    await Bun.sleep(NETWORK_POLL_MS);
    return this.waitForNetworkIdle();
  }

  private async fullPageClip(): Promise<{
    x: number;
    y: number;
    width: number;
    height: number;
    scale: number;
  }> {
    const metrics = await this.view.cdp<LayoutMetricsResult>(
      "Page.getLayoutMetrics",
    );
    const content = metrics.cssContentSize;
    if (!content)
      throw new Error("Chromium did not return CSS content metrics");
    return {
      x: 0,
      y: 0,
      width: Math.max(this.viewport.width, Math.ceil(content.width)),
      height: Math.max(this.viewport.height, Math.ceil(content.height)),
      scale: 1,
    };
  }
}

function networkRequestFromEvent(
  event: Event,
): NetworkRequestEvent | undefined {
  if (!("data" in event)) return undefined;
  const data = event.data;
  if (
    typeof data !== "object" ||
    data === null ||
    !("requestId" in data) ||
    typeof data.requestId !== "string"
  ) {
    return undefined;
  }
  return { requestId: data.requestId };
}

function pdfDimensions(
  options: Parameters<MediaPage["pdf"]>[0],
): Record<string, number> {
  if (options.width !== undefined || options.height !== undefined) {
    return {
      ...(options.width !== undefined
        ? { paperWidth: toInches(options.width) }
        : {}),
      ...(options.height !== undefined
        ? { paperHeight: toInches(options.height) }
        : {}),
    };
  }

  if (!options.format) return {};
  const dimensions = PDF_FORMAT_DIMENSIONS[options.format.toLowerCase()];
  if (!dimensions) throw new Error(`Unsupported PDF format: ${options.format}`);
  return dimensions;
}

function toInches(value: string | number): number {
  if (typeof value === "number") return value / CSS_PIXELS_PER_INCH;
  const match = /^\s*(\d+(?:\.\d+)?)\s*(px|in|cm|mm)?\s*$/iu.exec(value);
  if (!match?.[1]) throw new Error(`Unsupported PDF dimension: ${value}`);
  const amount = Number(match[1]);
  switch (match[2]?.toLowerCase() ?? "px") {
    case "in":
      return amount;
    case "cm":
      return amount / 2.54;
    case "mm":
      return amount / 25.4;
    default:
      return amount / CSS_PIXELS_PER_INCH;
  }
}

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  description: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${description} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

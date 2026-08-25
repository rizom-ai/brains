import { getErrorMessage } from "@brains/utils/error";
import type {
  BrowserFactory,
  MediaBrowser,
  MediaPage,
  ViewportOptions,
  WaitUntilState,
} from "./browser-types";
import { MediaRenderError } from "./renderer";

const NETWORK_IDLE_MS = 500;
const NETWORK_POLL_MS = 10;
const CSS_PIXELS_PER_INCH = 96;

export interface WebViewBrowserLaunchOptions {
  executablePath?: string;
  args?: string[];
}

interface PrintToPdfResult {
  data: string;
}

interface CaptureScreenshotResult {
  data: string;
}

interface NetworkRequestEvent {
  requestId: string;
}

/**
 * Bun 1.4 WebView adapter for the renderer's existing browser seam.
 *
 * The factory remains opt-in while the experimental WebView API is evaluated.
 */
export function createWebViewBrowserFactory(
  options: WebViewBrowserLaunchOptions = {},
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

class WebViewMediaBrowser implements MediaBrowser {
  private readonly options: WebViewBrowserLaunchOptions;
  private readonly pages = new Set<WebViewMediaPage>();
  private initialView: Bun.WebView | undefined;

  constructor(options: WebViewBrowserLaunchOptions) {
    this.options = options;
  }

  public async initialize(): Promise<void> {
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
    this.initialView?.close();
    this.initialView = undefined;
    const pages = [...this.pages];
    this.pages.clear();
    await Promise.all(pages.map((page) => page.close()));
  }

  private createView(viewport: ViewportOptions): Bun.WebView {
    const backend: Bun.WebView.Backend = {
      type: "chrome",
      url: false,
      ...(this.options.executablePath
        ? { path: this.options.executablePath }
        : {}),
      ...(this.options.args ? { argv: this.options.args } : {}),
    };
    return new Bun.WebView({
      width: viewport.width,
      height: viewport.height,
      backend,
    });
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
      const result = await this.view.cdp<CaptureScreenshotResult>(
        "Page.captureScreenshot",
        {
          format: "png",
          fromSurface: true,
          captureBeyondViewport: options.fullPage ?? false,
        },
      );
      return Buffer.from(result.data, "base64");
    } finally {
      if (options.omitBackground) {
        await this.view.cdp("Emulation.setDefaultBackgroundColorOverride");
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
    if (
      this.activeRequests.size === 0 &&
      performance.now() - this.lastNetworkActivity >= NETWORK_IDLE_MS
    ) {
      return;
    }
    await Bun.sleep(NETWORK_POLL_MS);
    return this.waitForNetworkIdle();
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

  const format = options.format?.toLowerCase();
  if (format === "a4") return { paperWidth: 8.2677, paperHeight: 11.6929 };
  if (format === "letter") return { paperWidth: 8.5, paperHeight: 11 };
  if (format === "legal") return { paperWidth: 8.5, paperHeight: 14 };
  return {};
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

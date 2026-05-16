export type WaitUntilState = "load" | "domcontentloaded" | "networkidle";

export interface ViewportOptions {
  width: number;
  height: number;
  deviceScaleFactor?: number;
}

export interface BrowserProcess {
  kill(signal?: NodeJS.Signals | number): boolean;
}

export interface MediaPage {
  goto(
    url: string,
    options: { waitUntil: WaitUntilState; timeout: number },
  ): Promise<unknown>;
  screenshot(options: {
    type: "png";
    fullPage?: boolean;
    omitBackground?: boolean;
  }): Promise<Buffer | Uint8Array>;
  pdf(options: {
    width?: string | number;
    height?: string | number;
    format?: string;
    printBackground?: boolean;
    preferCSSPageSize?: boolean;
    margin?: {
      top?: string | number;
      right?: string | number;
      bottom?: string | number;
      left?: string | number;
    };
  }): Promise<Buffer | Uint8Array>;
  close?(): Promise<void>;
}

export interface MediaBrowser {
  newPage(options?: { viewport?: ViewportOptions }): Promise<MediaPage>;
  close(): Promise<void>;
  process?(): BrowserProcess | null;
}

export interface BrowserFactory {
  launch(): Promise<MediaBrowser>;
}

export interface BrowserLaunchOptions {
  executablePath?: string;
  args?: string[];
  env?: Record<string, string | number | boolean>;
}

export interface ScreenshotPngOptions {
  timeoutMs?: number;
  waitUntil?: WaitUntilState;
  fullPage?: boolean;
  omitBackground?: boolean;
  browserFactory?: BrowserFactory;
}

export interface PdfRenderOptions {
  timeoutMs?: number;
  waitUntil?: WaitUntilState;
  width?: string | number;
  height?: string | number;
  format?: string;
  printBackground?: boolean;
  preferCSSPageSize?: boolean;
  maxBytes?: number;
  margin?: {
    top?: string | number;
    right?: string | number;
    bottom?: string | number;
    left?: string | number;
  };
  browserFactory?: BrowserFactory;
}

interface PlaywrightModule {
  chromium: {
    launch(options: {
      headless: boolean;
      executablePath?: string;
      args?: string[];
      env?: Record<string, string | number | boolean>;
    }): Promise<MediaBrowser>;
  };
}

const DEFAULT_TIMEOUT_MS = 30_000;

export class MediaRenderError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "browser-launch-failed"
      | "render-timeout"
      | "output-too-large"
      | "invalid-output",
  ) {
    super(message);
    this.name = "MediaRenderError";
  }
}

export function createChromiumBrowserFactory(
  options: BrowserLaunchOptions = {},
): BrowserFactory {
  return {
    async launch(): Promise<MediaBrowser> {
      try {
        // Keep this dynamic and non-literal so packages that do not import this
        // module do not require Playwright types/browsers at boot or compile time.
        const moduleName = "playwright-core";
        const playwright = (await import(moduleName)) as PlaywrightModule;
        return await playwright.chromium.launch({
          headless: true,
          ...options,
        });
      } catch (error) {
        throw new MediaRenderError(
          `Failed to launch Chromium for media rendering: ${getErrorMessage(error)}`,
          "browser-launch-failed",
        );
      }
    },
  };
}

export async function screenshotPng(
  url: string,
  viewport: ViewportOptions,
  options: ScreenshotPngOptions = {},
): Promise<Buffer> {
  return withBrowser(
    options.browserFactory ?? createChromiumBrowserFactory(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    async (browser) => {
      const page = await browser.newPage({ viewport });
      try {
        await page.goto(url, {
          waitUntil: options.waitUntil ?? "networkidle",
          timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        });
        const screenshotOptions: {
          type: "png";
          fullPage?: boolean;
          omitBackground?: boolean;
        } = {
          type: "png",
          fullPage: options.fullPage ?? false,
          ...(options.omitBackground !== undefined && {
            omitBackground: options.omitBackground,
          }),
        };
        const data = await page.screenshot(screenshotOptions);
        const buffer = Buffer.from(data);
        assertPng(buffer);
        return buffer;
      } finally {
        await closePage(page);
      }
    },
  );
}

export async function renderPdf(
  url: string,
  options: PdfRenderOptions = {},
): Promise<Buffer> {
  return withBrowser(
    options.browserFactory ?? createChromiumBrowserFactory(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    async (browser) => {
      const page = await browser.newPage();
      try {
        await page.goto(url, {
          waitUntil: options.waitUntil ?? "networkidle",
          timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        });
        const pdfOptions: Parameters<MediaPage["pdf"]>[0] = {
          ...(options.width !== undefined && { width: options.width }),
          ...(options.height !== undefined && { height: options.height }),
          ...(options.format !== undefined && { format: options.format }),
          printBackground: options.printBackground ?? true,
          preferCSSPageSize: options.preferCSSPageSize ?? true,
          ...(options.margin !== undefined && { margin: options.margin }),
        };
        const data = await page.pdf(pdfOptions);
        const buffer = Buffer.from(data);
        assertPdf(buffer);
        if (
          options.maxBytes !== undefined &&
          buffer.length > options.maxBytes
        ) {
          throw new MediaRenderError(
            `Rendered PDF is ${buffer.length} bytes, exceeding maxBytes=${options.maxBytes}`,
            "output-too-large",
          );
        }
        return buffer;
      } finally {
        await closePage(page);
      }
    },
  );
}

async function withBrowser<T>(
  browserFactory: BrowserFactory,
  timeoutMs: number,
  operation: (browser: MediaBrowser) => Promise<T>,
): Promise<T> {
  const browser = await browserFactory.launch();
  const browserProcess = browser.process?.() ?? null;
  let closed = false;

  const closeOnce = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    try {
      await browser.close();
    } catch {
      try {
        browserProcess?.kill("SIGKILL");
      } catch {
        // Process may already be dead; nothing more we can do.
      }
    }
  };

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      void closeOnce();
      reject(
        new MediaRenderError(
          `Media render timed out after ${timeoutMs}ms`,
          "render-timeout",
        ),
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation(browser), timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
    await closeOnce();
  }
}

async function closePage(page: MediaPage): Promise<void> {
  await page.close?.().catch(() => undefined);
}

function assertPng(buffer: Buffer): void {
  const pngMagic = [0x89, 0x50, 0x4e, 0x47] as const;
  const isPng = pngMagic.every((byte, index) => buffer[index] === byte);
  if (!isPng) {
    throw new MediaRenderError(
      "Screenshot output was not a PNG",
      "invalid-output",
    );
  }
}

function assertPdf(buffer: Buffer): void {
  if (buffer.subarray(0, 4).toString("ascii") !== "%PDF") {
    throw new MediaRenderError(
      "Rendered output was not a PDF",
      "invalid-output",
    );
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

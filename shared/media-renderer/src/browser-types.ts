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

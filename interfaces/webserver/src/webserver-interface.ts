import { InterfacePlugin } from "@brains/plugin-utils";
import { ServerManager } from "./server-manager";
import { existsSync } from "fs";
import { join } from "path";
import { z } from "zod";
import packageJson from "../package.json";

export const webserverConfigSchema = z.object({
  previewDistDir: z.string(),
  productionDistDir: z.string(),
  previewPort: z.number(),
  productionPort: z.number(),
});

export type WebserverConfig = z.infer<typeof webserverConfigSchema>;
export type WebserverConfigInput = Partial<WebserverConfig>;

/**
 * Webserver interface for serving static sites
 * This is a pure serving interface - site building is handled by site-builder
 */
export class WebserverInterface extends InterfacePlugin<WebserverConfigInput> {
  declare protected config: WebserverConfig;
  private serverManager: ServerManager;

  constructor(config: WebserverConfigInput = {}) {
    const defaults: Partial<WebserverConfig> = {
      previewDistDir: "./dist",
      productionDistDir: "./dist-production",
      previewPort: 3456,
      productionPort: 4567,
    };

    super("webserver", packageJson, config, webserverConfigSchema, defaults);

    this.serverManager = new ServerManager({
      logger: this.logger,
      previewDistDir: this.config.previewDistDir,
      productionDistDir: this.config.productionDistDir,
      previewPort: this.config.previewPort,
      productionPort: this.config.productionPort,
    });
  }

  /**
   * Start the interface
   */
  async start(): Promise<void> {
    // Ensure dist directory exists
    await this.ensureDistDirectory();

    // Auto-start both preview and production servers
    await this.serverManager.startPreviewServer();
    await this.serverManager.startProductionServer();
  }

  /**
   * Ensure the dist directories exist with at least a basic index.html
   */
  private async ensureDistDirectory(): Promise<void> {
    const { mkdir, writeFile } = await import("fs/promises");

    // Create a basic placeholder index.html
    const placeholderHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Personal Brain - Not Built Yet</title>
    <style>
        body {
            font-family: system-ui, -apple-system, sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
            background-color: #f5f5f5;
        }
        .container {
            background: white;
            padding: 2rem;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            margin-bottom: 1rem;
        }
        .status {
            background-color: #fffbeb;
            border: 1px solid #fbbf24;
            color: #92400e;
            padding: 1rem;
            border-radius: 4px;
            margin: 1rem 0;
        }
        .instructions {
            background-color: #f0f9ff;
            border: 1px solid #3b82f6;
            color: #1e40af;
            padding: 1rem;
            border-radius: 4px;
            margin: 1rem 0;
        }
        code {
            background-color: #f3f4f6;
            padding: 0.2rem 0.4rem;
            border-radius: 3px;
            font-family: monospace;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🧠 Personal Brain</h1>
        
        <div class="status">
            <strong>⚠️ Site Not Built Yet</strong>
            <p>The Personal Brain website hasn't been built yet. This is a placeholder page.</p>
        </div>
        
        <div class="instructions">
            <strong>To build your site:</strong>
            <p>Run the build command to generate your Personal Brain website:</p>
            <p><code>brain build:site</code></p>
        </div>
        
        <p>Once built, this page will be replaced with your actual Personal Brain website.</p>
    </div>
</body>
</html>`;

    // Create preview dist directory if it doesn't exist
    if (!existsSync(this.config.previewDistDir)) {
      await mkdir(this.config.previewDistDir, { recursive: true });

      await writeFile(
        join(this.config.previewDistDir, "index.html"),
        placeholderHtml,
      );
    }

    // Create production dist directory if it doesn't exist
    if (!existsSync(this.config.productionDistDir)) {
      await mkdir(this.config.productionDistDir, { recursive: true });

      await writeFile(
        join(this.config.productionDistDir, "index.html"),
        placeholderHtml,
      );
    }
  }

  /**
   * Stop the interface
   */
  async stop(): Promise<void> {
    await this.serverManager.stopAll();
  }

  /**
   * Check if the interface is running
   */
  isRunning(): boolean {
    const status = this.serverManager.getStatus();
    return status.preview || status.production;
  }
}

import type { BrainProtocol } from "@brains/types";
import { BaseInterface } from "@brains/interface-core";
import type { InterfaceContext, MessageContext } from "@brains/interface-core";
import { ServerManager } from "./server-manager";
import { existsSync } from "fs";
import { join } from "path";

export interface WebserverOptions {
  distDir: string;
  previewPort?: number;
  productionPort?: number;
}

/**
 * Webserver interface for serving static sites
 * This is a pure serving interface - site building is handled by site-builder
 */
export class WebserverInterface extends BaseInterface {
  public readonly id = "webserver";
  public readonly description = "Serves static websites built by site-builder";

  private serverManager: ServerManager;
  private options: WebserverOptions;

  constructor(context: InterfaceContext, options?: WebserverOptions) {
    super(context);

    // Use provided options or defaults
    this.options = {
      distDir: options?.distDir ?? "./dist",
      previewPort: options?.previewPort ?? 3456,
      productionPort: options?.productionPort ?? 4567,
    };

    this.serverManager = new ServerManager({
      logger: this.logger.child("ServerManager"),
      distDir: this.options.distDir,
      previewPort: this.options.previewPort as number,
      productionPort: this.options.productionPort as number,
    });
  }

  /**
   * Initialize the interface with the brain protocol
   */
  async initialize(_protocol: BrainProtocol): Promise<void> {
    // Protocol is available if needed in the future
  }

  /**
   * Start the interface
   */
  async start(): Promise<void> {
    // Ensure dist directory exists
    await this.ensureDistDirectory();

    // Auto-start preview server
    await this.serverManager.startPreviewServer();
  }

  /**
   * Ensure the dist directory exists with at least a basic index.html
   */
  private async ensureDistDirectory(): Promise<void> {
    const { mkdir, writeFile } = await import("fs/promises");

    // Create dist directory if it doesn't exist
    if (!existsSync(this.options.distDir)) {
      await mkdir(this.options.distDir, { recursive: true });

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

      await writeFile(
        join(this.options.distDir, "index.html"),
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

  /**
   * Handle local commands for the webserver interface
   */
  protected async handleLocalCommand(
    _command: string,
    _context: MessageContext,
  ): Promise<string | null> {
    // Webserver has no local commands - all commands go to Shell
    return null;
  }

  /**
   * Get available commands for this interface
   */
  getCommands(): Array<{
    name: string;
    description: string;
    handler: (args: string[]) => Promise<string>;
  }> {
    return [
      {
        name: "start_preview",
        description: "Start the preview server",
        handler: async (): Promise<string> => {
          const url = await this.serverManager.startPreviewServer();
          return `Preview server started at ${url}`;
        },
      },
      {
        name: "start_production",
        description: "Start the production server",
        handler: async (): Promise<string> => {
          const url = await this.serverManager.startProductionServer();
          return `Production server started at ${url}`;
        },
      },
      {
        name: "stop_preview",
        description: "Stop the preview server",
        handler: async (): Promise<string> => {
          await this.serverManager.stopServer("preview");
          return "Preview server stopped";
        },
      },
      {
        name: "stop_production",
        description: "Stop the production server",
        handler: async (): Promise<string> => {
          await this.serverManager.stopServer("production");
          return "Production server stopped";
        },
      },
      {
        name: "status",
        description: "Get server status",
        handler: async (): Promise<string> => {
          const status = this.serverManager.getStatus();
          const lines = ["Server Status:"];

          if (status.preview) {
            lines.push(`Preview: Running at ${status.previewUrl}`);
          } else {
            lines.push("Preview: Stopped");
          }

          if (status.production) {
            lines.push(`Production: Running at ${status.productionUrl}`);
          } else {
            lines.push("Production: Stopped");
          }

          return lines.join("\n");
        },
      },
      {
        name: "build_info",
        description: "Get information about the current build",
        handler: async (): Promise<string> => {
          const indexPath = join(this.options.distDir, "index.html");
          if (!existsSync(indexPath)) {
            return "No build found. Please build your site first.";
          }

          const stats = await Bun.file(indexPath).stat();
          const buildTime = stats.mtime.toLocaleString();

          return `Build found at: ${this.options.distDir}\nLast built: ${buildTime}`;
        },
      },
    ];
  }
}

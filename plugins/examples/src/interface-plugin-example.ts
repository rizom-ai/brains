import { InterfacePlugin } from "@brains/plugins";
import type {
  InterfacePluginContext,
  Daemon,
  BaseJobTrackingInfo,
  DaemonHealth,
  JobProgressEvent,
  JobContext,
} from "@brains/plugins";
import { z } from "@brains/utils";

// Define tracking info for webserver interface jobs
export interface WebserverTrackingInfo extends BaseJobTrackingInfo {
  sessionId: string; // Session context
  requestId: string; // Request identification
}

// Define the plugin configuration schema
const webserverConfigSchema = z.object({
  enabled: z.boolean().describe("Enable the webserver interface").default(true),
  port: z.number().describe("Port to run the webserver on").default(3000),
  host: z.string().describe("Host to bind to").default("localhost"),
  debug: z.boolean().describe("Enable debug logging").default(false),
});

type WebserverConfig = z.infer<typeof webserverConfigSchema>;
type WebserverConfigInput = Partial<WebserverConfig>;

/**
 * Example Webserver Interface Plugin
 * Demonstrates InterfacePlugin capabilities:
 * - Everything from Core (messaging, templates, logging)
 * - Daemon management for persistent processes
 * - Route registration for web UI
 * - System integration
 * - Generic job tracking and inheritance logic
 */
export class ExampleInterfacePlugin extends InterfacePlugin<
  WebserverConfig,
  WebserverTrackingInfo
> {
  declare protected config: WebserverConfig;
  private isRunning = false;

  constructor(config: WebserverConfigInput = {}) {
    super(
      "webserver-interface",
      {
        name: "@brains/webserver-interface-plugin",
        version: "1.0.0",
        description: "Example webserver interface for Personal Brain",
      },
      config,
      webserverConfigSchema,
    );
  }

  /**
   * Create the daemon for the webserver
   */
  protected override createDaemon(): Daemon {
    return {
      start: async (): Promise<void> => {
        this.logger.info(
          `Starting webserver daemon on ${this.config.host}:${this.config.port}`,
        );
        this.isRunning = true;
        // In a real implementation, this would start an HTTP server
      },

      stop: async (): Promise<void> => {
        this.logger.info("Stopping webserver daemon");
        this.isRunning = false;
        // In a real implementation, this would stop the HTTP server
      },

      healthCheck: async (): Promise<DaemonHealth> => {
        return {
          status: this.isRunning ? "healthy" : "error",
          message: this.isRunning
            ? `Webserver is running on ${this.config.host}:${this.config.port}`
            : "Webserver is not running",
          lastCheck: new Date(),
        };
      },
    };
  }

  protected override async onRegister(
    context: InterfacePluginContext,
  ): Promise<void> {
    // Subscribe to system messages
    context.subscribe("system:status:request", async () => {
      const status = await this.daemon?.healthCheck?.();
      return {
        success: true,
        data: {
          status: status?.status ?? "unknown",
          message: status?.message ?? "Status unknown",
        },
      };
    });

    // Register templates for web output
    context.registerTemplates({
      "web-page": {
        name: "web-page",
        description: "Format web page content",
        requiredPermission: "public",
        basePrompt: "",
        schema: z.object({
          title: z.string(),
          content: z.string(),
          timestamp: z.string().optional(),
        }),
        formatter: {
          format: (data: {
            title: string;
            content: string;
            timestamp?: string;
          }) => {
            return `<!DOCTYPE html>
<html>
<head><title>${data.title}</title></head>
<body>
  <h1>${data.title}</h1>
  <div>${data.content}</div>
  ${data.timestamp ? `<footer>Generated at: ${data.timestamp}</footer>` : ""}
</body>
</html>`;
          },
          parse: (html: string) => {
            const titleMatch = html.match(/<title>([^<]+)<\/title>/);
            const h1Match = html.match(/<h1>([^<]+)<\/h1>/);
            const contentMatch = html.match(/<div>([^<]+)<\/div>/);
            const footerMatch = html.match(
              /<footer>Generated at: ([^<]+)<\/footer>/,
            );

            return {
              title: titleMatch?.[1] ?? h1Match?.[1] ?? "",
              content: contentMatch?.[1] ?? "",
              timestamp: footerMatch?.[1],
            };
          },
        },
      },
      "api-response": {
        name: "api-response",
        description: "Format API responses",
        requiredPermission: "public",
        basePrompt: "",
        schema: z.object({
          data: z.any(),
          status: z.string(),
          timestamp: z.string(),
        }),
        formatter: {
          format: (data: {
            data: unknown;
            status: string;
            timestamp: string;
          }) => {
            return JSON.stringify(
              {
                status: data.status,
                data: data.data,
                timestamp: data.timestamp,
              },
              null,
              2,
            );
          },
          parse: (json: string) => {
            try {
              return JSON.parse(json);
            } catch {
              return {
                data: null,
                status: "error",
                timestamp: new Date().toISOString(),
              };
            }
          },
        },
      },
    });

    context.logger.info("Webserver interface plugin registered");

    // Call parent implementation
    await super.onRegister(context);
  }

  /**
   * Start the webserver interface
   */
  async start(): Promise<void> {
    if (this.daemon) {
      await this.daemon.start();
      this.logger.info("Webserver interface started");
    }
  }

  /**
   * Stop the webserver interface
   */
  async stop(): Promise<void> {
    if (this.daemon) {
      await this.daemon.stop();
      this.logger.info("Webserver interface stopped");
    }
  }

  /**
   * Example method showing how to serve content
   */
  async serveContent(path: string): Promise<string> {
    const context = this.getContext();

    // In a real implementation, this would:
    // 1. Check if the path maps to a route
    // 2. Query for the appropriate content
    // 3. Format it using templates

    const response = await context.query(`Content for path: ${path}`, {
      interfaceId: this.id,
      source: "webserver",
    });

    // Format the response as HTML
    return this.formatContent("web-page", {
      title: `Page: ${path}`,
      content: response.message,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Example method showing how to handle API requests
   */
  async handleApiRequest(endpoint: string, params: unknown): Promise<string> {
    // In a real implementation, this would route to appropriate handlers
    // For now, just echo the request
    return this.formatContent("api-response", {
      data: { endpoint, params },
      status: "success",
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Handle progress events for webserver interface
   * Uses generic job tracking and inheritance logic from InterfacePlugin
   */
  protected async handleProgressEvent(
    event: JobProgressEvent,
    context: JobContext,
  ): Promise<void> {
    // Use the generic inheritance logic to determine if we own this job
    if (!this.ownsJob(event.id, context.rootJobId)) {
      return; // Not our job, ignore
    }

    // Get tracking info (direct or inherited)
    const trackingInfo = this.getJobTracking(event.id, context.rootJobId);
    if (!trackingInfo) {
      this.logger.warn("No tracking info found for owned job", {
        jobId: event.id,
        rootJobId: context.rootJobId,
      });
      return;
    }

    // Log progress for demonstration (real implementation would update UI)
    this.logger.debug("Webserver progress event", {
      jobId: event.id,
      status: event.status,
      message: event.message,
      trackingInfo,
    });

    // In a real webserver interface, this might:
    // - Update a progress bar in the UI
    // - Send server-sent events to connected clients
    // - Update a job status page
    // - Store progress in session for polling endpoints
  }
}

// Export a factory function for easy instantiation
export function webserverInterfacePlugin(
  config?: WebserverConfigInput,
): ExampleInterfacePlugin {
  return new ExampleInterfacePlugin(config);
}

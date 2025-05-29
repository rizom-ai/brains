import { Shell } from "@brains/shell";
import { StdioMCPServer, StreamableHTTPServer } from "@brains/mcp-server";
import { appConfigSchema, type AppConfig } from "./types.js";

export class App {
  private shell: Shell;
  private server: StdioMCPServer | StreamableHTTPServer | null = null;
  private config: AppConfig;

  public static create(config?: Partial<AppConfig>, shell?: Shell): App {
    const validatedConfig = appConfigSchema.parse(config ?? {});
    return new App(validatedConfig, shell);
  }

  private constructor(config: AppConfig, shell?: Shell) {
    this.config = config;
    
    if (shell) {
      this.shell = shell;
    } else {
      // Create shell with provided config or defaults
      const shellConfig = {
        dbPath: config.dbPath,
        pluginPaths: config.pluginPaths,
        ...config.shellConfig,
      };
      
      this.shell = Shell.createFresh(shellConfig);
    }
  }

  public async initialize(): Promise<void> {
    // Initialize shell
    await this.shell.initialize();
    
    // Create and configure transport server
    const mcpServer = this.shell.getMcpServer();
    
    if (this.config.transport.type === "stdio") {
      this.server = new StdioMCPServer();
      this.server.connectMCPServer(mcpServer);
    } else {
      this.server = new StreamableHTTPServer({
        port: this.config.transport.port,
        host: this.config.transport.host,
      });
      this.server.connectMCPServer(mcpServer);
    }
  }

  public async start(): Promise<void> {
    if (!this.server) {
      throw new Error("App not initialized. Call initialize() first.");
    }
    
    await this.server.start();
  }

  public async stop(): Promise<void> {
    if (this.server) {
      await this.server.stop();
    }
  }

  public getShell(): Shell {
    return this.shell;
  }

  public getServer(): StdioMCPServer | StreamableHTTPServer | null {
    return this.server;
  }
}
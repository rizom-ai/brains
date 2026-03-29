import type { Subprocess } from "bun";
import type { Logger } from "@brains/utils";
import { resolve, join } from "path";
import { type HealthMessage, HEARTBEAT_INTERVAL_MS } from "./health-ipc";

export interface ServerManagerOptions {
  logger: Logger;
  previewDistDir?: string;
  productionDistDir: string;
  sharedImagesDir: string;
  previewPort?: number;
  productionPort: number;
}

/**
 * Manages the webserver child process.
 *
 * The static file server runs in a separate process to keep HTTP traffic
 * off the main brain event loop. The child process is a standalone Bun
 * script that serves static files with clean URLs, cache headers, and 404s.
 */
export class ServerManager {
  private logger: Logger;
  private options: ServerManagerOptions;
  private childProcess: Subprocess | null = null;
  private isRunning = false;
  private cleanupHandler: (() => void) | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: ServerManagerOptions) {
    this.logger = options.logger;
    this.options = {
      ...options,
      productionDistDir: resolve(process.cwd(), options.productionDistDir),
      sharedImagesDir: resolve(process.cwd(), options.sharedImagesDir),
      ...(options.previewDistDir && {
        previewDistDir: resolve(process.cwd(), options.previewDistDir),
      }),
    };
  }

  /**
   * Start the webserver child process
   */
  async start(): Promise<void> {
    if (this.childProcess) {
      this.logger.warn("Webserver child process already running");
      return;
    }

    const standaloneServerPath = join(import.meta.dir, "standalone-server.ts");

    const env: Record<string, string> = {
      PRODUCTION_DIST_DIR: this.options.productionDistDir,
      SHARED_IMAGES_DIR: this.options.sharedImagesDir,
      PRODUCTION_PORT: String(this.options.productionPort),
    };

    if (this.options.previewDistDir) {
      env["PREVIEW_DIST_DIR"] = this.options.previewDistDir;
    }
    if (this.options.previewPort) {
      env["PREVIEW_PORT"] = String(this.options.previewPort);
    }

    this.logger.debug("Spawning webserver child process", {
      script: standaloneServerPath,
      productionPort: this.options.productionPort,
      previewPort: this.options.previewPort,
    });

    this.childProcess = Bun.spawn(["bun", "run", standaloneServerPath], {
      env: { ...process.env, ...env },
      stdout: "pipe",
      stderr: "pipe",
      ipc: () => {
        // Child can send IPC messages back — currently unused but keeps channel open
      },
      onExit: (_proc, exitCode) => {
        this.isRunning = false;
        this.childProcess = null;
        this.stopHeartbeat();
        if (exitCode !== 0 && exitCode !== null) {
          this.logger.error("Webserver child process exited unexpectedly", {
            exitCode,
          });
        }
      },
    });

    try {
      await this.waitForReady();
    } catch (err) {
      this.childProcess.kill();
      this.childProcess = null;
      throw err;
    }
    this.isRunning = true;

    // Kill child if parent exits unexpectedly
    this.cleanupHandler = (): void => {
      this.childProcess?.kill();
    };
    process.once("exit", this.cleanupHandler);

    this.startHeartbeat();

    this.logger.info(
      `Webserver child process started (pid: ${this.childProcess.pid})`,
    );

    // Pipe child output to logger to prevent buffer fill
    const { stdout, stderr } = this.childProcess;
    if (stdout && typeof stdout !== "number") {
      void this.pipeStreamToLogger(stdout, "debug");
    }
    if (stderr && typeof stderr !== "number") {
      void this.pipeStreamToLogger(stderr, "warn");
    }
  }

  /**
   * Stop the webserver child process
   */
  async stop(): Promise<void> {
    if (!this.childProcess) return;

    this.logger.debug("Stopping webserver child process");
    this.stopHeartbeat();
    if (this.cleanupHandler) {
      process.off("exit", this.cleanupHandler);
      this.cleanupHandler = null;
    }
    this.childProcess.kill();
    this.childProcess = null;
    this.isRunning = false;
    this.logger.debug("Webserver child process stopped");
  }

  /**
   * Start sending periodic heartbeats to the child process via IPC.
   */
  private startHeartbeat(): void {
    this.sendHeartbeat(); // Send immediately
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Stop the heartbeat interval.
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Send a single heartbeat message to the child process.
   */
  private sendHeartbeat(): void {
    if (!this.childProcess) return;
    const message: HealthMessage = { type: "heartbeat" };
    try {
      this.childProcess.send(message);
    } catch {
      // Child process may have exited — heartbeat will stop on next onExit
    }
  }

  /**
   * Get server status
   */
  getStatus(): {
    running: boolean;
    pid: number | undefined;
    productionUrl: string | undefined;
    previewUrl: string | undefined;
  } {
    return {
      running: this.isRunning,
      pid: this.childProcess?.pid,
      productionUrl: this.isRunning
        ? `http://localhost:${this.options.productionPort}`
        : undefined,
      previewUrl:
        this.isRunning && this.options.previewPort
          ? `http://localhost:${this.options.previewPort}`
          : undefined,
    };
  }

  /**
   * Wait for the child process to signal readiness via stdout.
   */
  private async waitForReady(): Promise<void> {
    const stdout = this.childProcess?.stdout;
    if (!stdout || typeof stdout === "number") {
      throw new Error("Child process stdout not available");
    }

    const reader = stdout.getReader();
    const decoder = new TextDecoder();
    const timeout = 10_000;
    const start = Date.now();

    try {
      let buffer = "";
      while (Date.now() - start < timeout) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");

        for (const line of lines) {
          if (line.includes("WEBSERVER_READY")) {
            // Log any other output lines
            for (const l of lines) {
              const trimmed = l.trim();
              if (trimmed && !trimmed.includes("WEBSERVER_READY")) {
                this.logger.debug(`[webserver] ${trimmed}`);
              }
            }
            return;
          }
        }

        // Keep the last incomplete line in the buffer
        buffer = lines[lines.length - 1] ?? "";
      }

      throw new Error("Webserver child process did not become ready in time");
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Pipe child process stderr to the logger.
   */
  private async pipeStreamToLogger(
    stream: ReadableStream<Uint8Array>,
    level: "debug" | "warn",
  ): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    try {
      let result = await reader.read();
      while (!result.done) {
        const text = decoder.decode(result.value, { stream: true }).trim();
        if (text) {
          this.logger[level](`[webserver] ${text}`);
        }
        result = await reader.read();
      }
    } catch {
      // Stream closed — child process exited
    } finally {
      reader.releaseLock();
    }
  }
}

// Re-export API server components for backward compatibility with tests
export { createApiRouteHandler } from "./api-server";

import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { z } from "@brains/utils/zod";
import {
  httpHostConfigSchema,
  staticSiteOutputSchema,
  type RegisteredStaticSiteOutput,
} from "@brains/plugins/contracts/http-host";
import type { RegisteredHttpRoute } from "@brains/plugins/internal/http-routes";
import type { RuntimeHealthCheck } from "@brains/plugins";
import { ServerManager, type ServerManagerOptions } from "./server-manager";
import { placeholderHtml } from "./templates/placeholder";

export interface HttpHostOptions extends Pick<
  ServerManagerOptions,
  "logger" | "getOperationalInfo" | "getReadinessData" | "messageBus" | "serve"
> {
  config: z.input<typeof httpHostConfigSchema>;
  routes: readonly RegisteredHttpRoute[];
  sites: readonly RegisteredStaticSiteOutput[];
  workingDirectory?: string;
}

/** One runtime-owned host. Construction validates composition without side effects. */
export class HttpHost {
  readonly configured: boolean;
  readonly preview: boolean;
  private readonly manager: ServerManager;
  private readonly productionDir: string;
  private readonly previewDir: string;

  constructor(options: HttpHostOptions) {
    const config = httpHostConfigSchema.parse(options.config);
    if (options.sites.length > 1) {
      throw new Error(
        `Multiple static site output owners: ${options.sites.map((site) => site.ownerPluginId).join(", ")}`,
      );
    }
    const declaration = options.sites[0];
    const site = declaration
      ? staticSiteOutputSchema.parse({
          productionOutputDir: declaration.productionOutputDir,
          previewOutputDir: declaration.previewOutputDir,
          sharedImagesDir: declaration.sharedImagesDir,
        })
      : undefined;
    const cwd = options.workingDirectory ?? process.cwd();
    const directory = (
      explicit: string | undefined,
      authored: string | undefined,
      fallback: string,
    ): string => {
      if (
        explicit &&
        authored &&
        resolve(cwd, explicit) !== resolve(cwd, authored)
      ) {
        throw new Error(
          `HTTP directory "${explicit}" conflicts with static site output "${authored}" from "${declaration?.ownerPluginId}"`,
        );
      }
      return resolve(cwd, authored ?? explicit ?? fallback);
    };
    this.productionDir = directory(
      config.productionDistDir,
      site?.productionOutputDir,
      "./dist/site-production",
    );
    this.previewDir = directory(
      config.previewDistDir,
      site?.previewOutputDir,
      "./dist/site-preview",
    );
    const imagesDir = directory(
      config.imagesDir,
      site?.sharedImagesDir,
      "./dist/images",
    );
    this.configured =
      options.routes.length > 0 ||
      site !== undefined ||
      config.productionDistDir !== undefined;
    this.preview = config.preview ?? site !== undefined;
    this.manager = new ServerManager({
      logger: options.logger,
      productionDistDir: this.productionDir,
      ...(this.preview && { previewDistDir: this.previewDir }),
      sharedImagesDir: imagesDir,
      productionPort: config.port,
      getRoutes: (): readonly RegisteredHttpRoute[] => options.routes,
      ...(options.getOperationalInfo && {
        getOperationalInfo: options.getOperationalInfo,
      }),
      ...(options.getReadinessData && {
        getReadinessData: options.getReadinessData,
      }),
      ...(options.messageBus && { messageBus: options.messageBus }),
      ...(options.serve && { serve: options.serve }),
    });
  }

  async start(): Promise<void> {
    if (!this.configured) return;
    for (const dir of [
      this.productionDir,
      ...(this.preview ? [this.previewDir] : []),
    ]) {
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, "index.html"), placeholderHtml, {
          flag: "wx",
        });
      }
    }
    await this.manager.start();
  }

  stop(): Promise<void> {
    return this.manager.stop();
  }
  getStatus(): ReturnType<ServerManager["getStatus"]> {
    return this.manager.getStatus();
  }
  health(): Omit<RuntimeHealthCheck, "name"> {
    const status = this.getStatus();
    return {
      status: !this.configured || status.running ? "healthy" : "unhealthy",
      message: !this.configured
        ? "HTTP host not configured"
        : status.running
          ? "HTTP host running"
          : "HTTP host unavailable",
      details: { configured: this.configured, ...status },
    };
  }
}

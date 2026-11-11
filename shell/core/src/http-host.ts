import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  createRouteToolExecutor,
  placeholderHtml,
  ServerManager,
} from "@brains/http-host";
import type {
  Daemon,
  DaemonHealth,
  EndpointInfoInput,
  IMessageBus,
  InteractionInfoInput,
  Plugin,
  PublicHealthInfo,
  RuntimeReadiness,
} from "@brains/plugins";
import type { RegisteredStaticSiteOutput } from "@brains/plugins/internal/http-host";
import { staticSiteOutputSchema } from "@brains/plugins/internal/http-host";
import type { RegisteredHttpRoute } from "@brains/plugins/internal/http-routes";
import { derivePreviewDomain } from "@brains/site-composition";
import type { Logger } from "@brains/utils/logger";
import type { HttpHostConfig } from "./config/http-config";

/**
 * The name the host answers to wherever it shows: its daemon, the Site and
 * Preview it advertises, and the caller a tool-backed API route runs as.
 */
export const HTTP_HOST_ID: string = "webserver";
export const HTTP_HOST_DAEMON: string = `${HTTP_HOST_ID}:${HTTP_HOST_ID}`;

const DEFAULT_PRODUCTION_DIR = "./dist/site-production";
const DEFAULT_PREVIEW_DIR = "./dist/site-preview";
const DEFAULT_IMAGES_DIR = "./dist/images";

interface ServingDirectories {
  productionDistDir: string;
  previewDistDir: string;
  sharedImagesDir: string;
}

/** The site output each plugin declares, read once when the host starts. */
export function collectStaticSiteOutputs(
  plugins: Iterable<Plugin>,
): RegisteredStaticSiteOutput[] {
  return [...plugins].flatMap((plugin) => {
    const output = plugin.getStaticSiteOutput?.();
    return output
      ? [{ ...staticSiteOutputSchema.parse(output), ownerPluginId: plugin.id }]
      : [];
  });
}

/**
 * Where the host serves from: where the site builder writes, else the
 * configured directories, else the defaults. A configured directory the
 * builder does not write, or two builders, is refused.
 */
function resolveServingDirectories(
  config: HttpHostConfig,
  outputs: readonly RegisteredStaticSiteOutput[],
): ServingDirectories {
  const [output, second] = outputs;
  if (output && second) {
    throw new Error(
      `Two plugins write the site the HTTP host serves: "${output.ownerPluginId}" and "${second.ownerPluginId}"`,
    );
  }
  const choose = (
    key: keyof ServingDirectories,
    written: string | undefined,
    label: string,
    fallback: string,
  ): string => {
    const configured = config[key];
    if (
      output &&
      written !== undefined &&
      configured !== undefined &&
      resolve(configured) !== resolve(written)
    ) {
      throw new Error(
        `http.${key} "${configured}" is not where "${output.ownerPluginId}" writes the ${label} ("${written}"); remove it or set it to the same directory`,
      );
    }
    return written ?? configured ?? fallback;
  };
  return {
    productionDistDir: choose(
      "productionDistDir",
      output?.productionOutputDir,
      "production site",
      DEFAULT_PRODUCTION_DIR,
    ),
    previewDistDir: choose(
      "previewDistDir",
      output?.previewOutputDir,
      "preview site",
      DEFAULT_PREVIEW_DIR,
    ),
    sharedImagesDir: choose(
      "sharedImagesDir",
      output?.sharedImagesDir,
      "shared images",
      DEFAULT_IMAGES_DIR,
    ),
  };
}

/** A fresh brain serves a page before its first site build. */
async function ensureDistDirectories(
  directories: ServingDirectories,
  preview: boolean,
  logger: Logger,
): Promise<void> {
  const dirs = [
    directories.productionDistDir,
    ...(preview ? [directories.previewDistDir] : []),
  ];
  for (const dir of dirs) {
    if (existsSync(dir)) continue;
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "index.html"), placeholderHtml);
    logger.debug(`Created site directory at ${dir}`);
  }
}

export interface HttpHostDaemonOptions {
  config: HttpHostConfig;
  /** The brain's bare domain, when it has one. */
  domain: string | undefined;
  logger: Logger;
  messageBus: Pick<IMessageBus, "send">;
  /** The finalized route table; read once when the host starts. */
  getRoutes: () => readonly RegisteredHttpRoute[];
  /** The plugins registered by the time the host starts. */
  getPlugins: () => Iterable<Plugin>;
  getOperationalInfo: () => Promise<PublicHealthInfo>;
  getReadinessData: () => Promise<RuntimeReadiness>;
}

function siteUrls(domain: string | undefined): {
  siteUrl: string | undefined;
  previewUrl: string | undefined;
} {
  return domain
    ? {
        siteUrl: `https://${domain}`,
        previewUrl: `https://${derivePreviewDomain(domain)}`,
      }
    : { siteUrl: undefined, previewUrl: undefined };
}

/**
 * The brain's one HTTP listener, run as the webserver daemon: started before
 * initial sync, stopped before the plugins whose routes it serves.
 */
export function createHttpHostDaemon(options: HttpHostDaemonOptions): Daemon {
  const { config, logger } = options;
  const { siteUrl, previewUrl } = siteUrls(options.domain);
  let manager: ServerManager | undefined;

  return {
    start: async (): Promise<void> => {
      const directories = resolveServingDirectories(
        config,
        collectStaticSiteOutputs(options.getPlugins()),
      );
      await ensureDistDirectories(directories, config.preview, logger);
      manager ??= new ServerManager({
        logger,
        productionDistDir: directories.productionDistDir,
        sharedImagesDir: directories.sharedImagesDir,
        productionPort: config.port,
        ...(config.hostname ? { hostname: config.hostname } : {}),
        ...(config.preview && { previewDistDir: directories.previewDistDir }),
        getOperationalInfo: options.getOperationalInfo,
        getReadinessData: options.getReadinessData,
        getRoutes: options.getRoutes,
        executeTool: createRouteToolExecutor(options.messageBus, HTTP_HOST_ID),
      });
      await manager.start();
    },
    stop: async (): Promise<void> => {
      await manager?.stop();
    },
    healthCheck: async (): Promise<DaemonHealth> => {
      const status = manager?.getStatus();
      const isRunning = status?.running ?? false;
      const productionUrl =
        siteUrl ?? status?.productionUrl ?? `http://localhost:${config.port}`;
      const servedPreviewUrl =
        previewUrl ?? status?.previewUrl ?? `http://localhost:${config.port}`;

      const urls: string[] = [];
      if (isRunning) {
        urls.push(`Production: ${productionUrl}`);
        if (status?.previewUrl) {
          urls.push(`Preview: ${servedPreviewUrl}`);
        }
      }

      return {
        status: isRunning ? "healthy" : "error",
        message: isRunning ? urls.join(", ") : "Webserver not running",
        lastCheck: new Date(),
        details: {
          preview: !!status?.previewUrl,
          production: isRunning,
          previewUrl: status?.previewUrl ? servedPreviewUrl : undefined,
          productionUrl: isRunning ? productionUrl : undefined,
        },
      };
    },
  };
}

/**
 * The Site and Preview the host serves, for the dashboard's Endpoints card
 * and the brain's ways in. A brain without a domain has no absolute URL to
 * advertise; the console is the operator's landing page.
 */
export function httpHostAdvertisements(
  config: HttpHostConfig,
  domain: string | undefined,
): { endpoints: EndpointInfoInput[]; interactions: InteractionInfoInput[] } {
  const { siteUrl, previewUrl } = siteUrls(domain);
  if (!siteUrl) return { endpoints: [], interactions: [] };
  const preview = config.preview && previewUrl ? previewUrl : undefined;
  return {
    endpoints: [
      { pluginId: HTTP_HOST_ID, label: "Site", url: siteUrl, priority: 10 },
      ...(preview
        ? [
            {
              pluginId: HTTP_HOST_ID,
              label: "Preview",
              url: preview,
              priority: 20,
              visibility: "admin" as const,
            },
          ]
        : []),
    ],
    interactions: [
      {
        pluginId: HTTP_HOST_ID,
        id: "site",
        label: "Public site",
        description: "Visit the published public site for this brain.",
        href: siteUrl,
        kind: "human",
        priority: 10,
      },
      ...(preview
        ? [
            {
              pluginId: HTTP_HOST_ID,
              id: "preview",
              label: "Preview site",
              description: "Open the private preview build.",
              href: preview,
              kind: "admin" as const,
              priority: 20,
              visibility: "admin" as const,
            },
          ]
        : []),
    ],
  };
}

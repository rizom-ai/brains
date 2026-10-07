import { describe, test, expect, beforeEach, mock } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import {
  createMockShell,
  createRequester,
  createServicePluginContext,
  createTestEntityAccess,
  createTestJobContext,
  runServiceJob,
} from "@brains/plugins/test";
import {
  handleSiteBuild,
  type SiteBuildJobHandlerConfig,
} from "../../src/handlers/siteBuildJobHandler";
import type { ISiteBuilder } from "../../src/types/site-builder-types";
import type { SiteBuildJobData } from "../../src/types/job-types";

/** The address a finished build tells the rest of the brain it rendered against. */
const completionSchema = z.looseObject({
  siteConfig: z.looseObject({ url: z.string().optional() }),
});

/** What the build announced, so a test can read the URL it published. */
interface Announcement {
  readonly topic: string;
  readonly data: object;
}

/**
 * Which URL a build writes into its pages, and tells the rest of the brain
 * about, is decided from the addresses the runtime reports rather than from
 * the domain: preview and live differ, and a locally served brain differs
 * from both.
 */
describe("the addresses a site build renders against", () => {
  let siteBuilder: ISiteBuilder;
  let announced: Announcement[];

  beforeEach(() => {
    announced = [];
    siteBuilder = {
      build: mock(async () => ({
        success: true,
        outputDir: "/tmp/output",
        filesGenerated: 5,
        routesBuilt: 5,
        errors: [],
        warnings: [],
      })),
    };
  });

  function build(
    overrides: Partial<SiteBuildJobHandlerConfig> = {},
  ): (input: SiteBuildJobData) => Promise<unknown> {
    const binding = handleSiteBuild({
      siteBuilder,
      messaging: {
        request: createRequester(async () => ({
          success: false,
          code: "no_handler",
        })),
        publish: async (message) => {
          announced.push({ topic: message.topic, data: message.data });
        },
      },
      logger: createSilentLogger("site-build-addresses-test"),
      layouts: {},
      defaultSiteConfig: {
        represents: "anchor",
        title: "Test",
        description: "Test",
      },
      sharedImagesDir: "./dist/images",
      ...overrides,
    });
    const shell = createMockShell();
    const runtime = createServicePluginContext(shell, "site-builder");
    return (input) =>
      runServiceJob(
        binding,
        createTestJobContext<SiteBuildJobData>({
          input,
          jobId: "test-job-id",
          ai: runtime.ai,
          logger: createSilentLogger("site-build-addresses-test"),
          entities: createTestEntityAccess({
            entityService: shell.getEntityService(),
            refuseWrites: "a site build writes files, never entities",
          }),
          conversations: runtime.conversations,
          identity: runtime.identity,
          template: (localName: string) =>
            `@brains/site-builder-plugin:site-builder:${localName}`,
        }),
      );
  }

  const buildRequest = {
    outputDir: "/tmp/output",
    workingDir: "/tmp/work",
    enableContentGeneration: false,
  };

  /** The completion announcement, which every one of these builds makes. */
  function completedUrl(): string | undefined {
    const completion = announced.find(
      (message) => message.topic === "site:build:completed",
    );
    if (!completion) throw new Error("The build announced no completion");
    return completionSchema.parse(completion.data).siteConfig.url;
  }

  test("a production build renders against the live URL", async () => {
    await build({
      siteUrl: "https://yeehaa.io",
      previewUrl: "https://preview.yeehaa.io",
    })({ ...buildRequest, environment: "production" });

    expect(siteBuilder.build).toHaveBeenCalledWith(
      expect.objectContaining({ siteUrl: "https://yeehaa.io" }),
      expect.anything(),
    );
    expect(completedUrl()).toBe("https://yeehaa.io");
  });

  test("a preview build renders against the preview URL", async () => {
    await build({
      siteUrl: "https://yeehaa.io",
      previewUrl: "https://preview.yeehaa.io",
    })({ ...buildRequest, environment: "preview" });

    expect(siteBuilder.build).toHaveBeenCalledWith(
      expect.objectContaining({ siteUrl: "https://preview.yeehaa.io" }),
      expect.anything(),
    );
    expect(completedUrl()).toBe("https://preview.yeehaa.io");
  });

  test("a preview with no preview URL falls back to the live one", async () => {
    await build({ siteUrl: "https://yeehaa.io" })({
      ...buildRequest,
      environment: "preview",
    });

    expect(completedUrl()).toBe("https://yeehaa.io");
  });

  test("a locally served brain renders against its local URL", async () => {
    await build({
      localSiteUrl: "http://localhost:8080",
      preferLocalUrls: true,
    })({ ...buildRequest, environment: "production" });

    expect(siteBuilder.build).toHaveBeenCalledWith(
      expect.objectContaining({ siteUrl: "http://localhost:8080" }),
      expect.anything(),
    );
    expect(completedUrl()).toBe("http://localhost:8080");
  });

  test("a deployed production build ignores the local URL", async () => {
    await build({
      localSiteUrl: "http://localhost:8080",
      preferLocalUrls: false,
    })({ ...buildRequest, environment: "production" });

    expect(siteBuilder.build).toHaveBeenCalledWith(
      expect.objectContaining({ siteUrl: undefined }),
      expect.anything(),
    );
    expect(completedUrl()).toBeUndefined();
  });
});

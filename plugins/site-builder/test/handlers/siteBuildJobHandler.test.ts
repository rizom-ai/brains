import { describe, it, expect, beforeEach, mock } from "bun:test";
import { expectDefined } from "@brains/utils/expect-defined";
import { createSilentLogger } from "@brains/test-utils";
import {
  createMockShell,
  createServicePluginContext,
  createTestEntityAccess,
  createTestJobContext,
  runServiceJob,
} from "@brains/plugins/test";
import { UISlotRegistry } from "@brains/site-engine";
import {
  handleSiteBuild,
  type BuildStatusRecorder,
  type SiteBuildJobHandlerConfig,
} from "../../src/handlers/siteBuildJobHandler";
import { siteBuildJob } from "../../src/lib/site-build-job";
import type { ISiteBuilder } from "../../src/types/site-builder-types";
import type { SiteBuilderConfig } from "../../src/config";
import {
  siteBuildJobResultSchema,
  type SiteBuildJobData,
  type SiteBuildJobResult,
} from "../../src/types/job-types";

const DEFAULT_SITE_CONFIG: SiteBuilderConfig["siteInfo"] = {
  represents: "anchor",
  title: "Test Site",
  description: "Test Description",
};

/** What the build announced, so a test can say whether completion was told. */
interface Announcement {
  readonly topic: string;
  readonly data: object;
}

function recordingMessaging(announced: Announcement[]): {
  send: SiteBuildJobHandlerConfig["messaging"]["send"];
  publish: SiteBuildJobHandlerConfig["messaging"]["publish"];
} {
  return {
    // Nothing owns the site's metadata in these tests, so the fallback stands.
    send: async () => ({ success: false, error: "no provider" }),
    publish: async (message): Promise<void> => {
      announced.push({ topic: message.topic, data: message.data });
    },
  };
}

describe("the site build job", () => {
  let siteBuilder: ISiteBuilder;
  let announced: Announcement[];

  beforeEach(() => {
    announced = [];
    siteBuilder = {
      build: mock(async () => ({
        success: true,
        outputDir: "/tmp/output",
        filesGenerated: 10,
        routesBuilt: 10,
      })),
    };
  });

  function build(
    overrides: Partial<SiteBuildJobHandlerConfig> = {},
  ): (input: SiteBuildJobData, jobId?: string) => Promise<SiteBuildJobResult> {
    const binding = handleSiteBuild({
      siteBuilder,
      messaging: recordingMessaging(announced),
      logger: createSilentLogger("site-build-job-test"),
      layouts: {},
      defaultSiteConfig: DEFAULT_SITE_CONFIG,
      sharedImagesDir: "./dist/images",
      ...overrides,
    });
    const shell = createMockShell();
    const runtime = createServicePluginContext(shell, "site-builder");
    return async (input, jobId = "job-1") => {
      const context = createTestJobContext<SiteBuildJobData>({
        input,
        jobId,
        ai: runtime.ai,
        logger: createSilentLogger("site-build-job-test"),
        entities: createTestEntityAccess({
          entityService: shell.getEntityService(),
          refuseWrites: "a site build writes files, never entities",
        }),
        conversations: runtime.conversations,
        identity: runtime.identity,
        template: (localName: string) =>
          `@brains/site-builder-plugin:site-builder:${localName}`,
        templates: {
          format: (_name, value): string => String(value),
          capabilities: (): null => null,
          generate: (name): never => {
            throw new Error(`A site build generates no template "${name}"`);
          },
        },
      });
      return siteBuildJobResultSchema.parse(
        await runServiceJob(binding, context),
      );
    };
  }

  describe("what it accepts", () => {
    it("takes an output directory and nothing else", () => {
      const parsed = expectDefined(
        siteBuildJob.input.safeParse({ outputDir: "/path/to/output" }).data,
        "the parsed build request",
      );

      expect(parsed.outputDir).toBe("/path/to/output");
      // Defaults are applied while the build runs, not while it is parsed.
      expect(parsed.environment).toBeUndefined();
      expect(parsed.enableContentGeneration).toBeUndefined();
    });

    it("takes every field a caller may name", () => {
      const parsed = expectDefined(
        siteBuildJob.input.safeParse({
          outputDir: "/path/to/output",
          workingDir: "/path/to/working",
          environment: "production",
          enableContentGeneration: true,
          siteConfig: {
            title: "Custom Title",
            description: "Custom Description",
          },
        }).data,
        "the parsed build request",
      );

      expect(parsed.workingDir).toBe("/path/to/working");
      expect(parsed.environment).toBe("production");
      expect(parsed.enableContentGeneration).toBe(true);
      expect(parsed.siteConfig?.title).toBe("Custom Title");
    });

    it("refuses a request with no output directory", () => {
      expect(siteBuildJob.input.safeParse({}).success).toBe(false);
    });

    it("refuses an environment that is neither preview nor production", () => {
      expect(
        siteBuildJob.input.safeParse({
          outputDir: "/path",
          environment: "invalid",
        }).success,
      ).toBe(false);
    });
  });

  it("hands the build the slots other packages registered", async () => {
    const slots = new UISlotRegistry();
    slots.register("footer-top", {
      pluginId: "newsletter",
      render: () => null,
    });
    let capturedOptions: { slots?: unknown } | undefined;

    const run = build({
      siteBuilder: {
        build: async (options) => {
          capturedOptions = options;
          return {
            success: true,
            outputDir: "/tmp/output",
            filesGenerated: 10,
            routesBuilt: 10,
          };
        },
      },
      slots,
    });

    await run({ outputDir: "/tmp/output" });

    expect(capturedOptions?.slots).toBe(slots);
  });

  it("reports the build lifecycle around execution", async () => {
    const lifecycle: string[] = [];
    const run = build({
      siteBuilder: {
        build: mock(async () => {
          lifecycle.push("build");
          return {
            success: true,
            outputDir: "/tmp/output",
            filesGenerated: 1,
            routesBuilt: 1,
          };
        }),
      },
      onBuildStarted: (environment, jobId, generation): void => {
        lifecycle.push(`start:${environment}:${jobId}:${generation}`);
      },
      onBuildFinished: async (
        environment,
        jobId,
        generation,
      ): Promise<void> => {
        lifecycle.push(`finish:${environment}:${jobId}:${generation}`);
      },
    });

    await run(
      { outputDir: "/tmp/output", environment: "preview", inputGeneration: 4 },
      "job-generation",
    );

    expect(lifecycle).toEqual([
      "start:preview:job-generation:4",
      "build",
      "finish:preview:job-generation:4",
    ]);
  });

  it("records a cancelled build without announcing completion", async () => {
    const markCancelled = mock(async () => undefined);
    const run = build({
      siteBuilder: {
        build: mock(async () => ({
          success: false,
          cancelled: true,
          outputDir: "/tmp/output",
          filesGenerated: 0,
          routesBuilt: 0,
          errors: ["[build-cancelled] Site build cancelled: superseded"],
        })),
      },
      statusService: recorder({ markCancelled }),
    });

    const result = await run(
      { outputDir: "/tmp/output", environment: "preview" },
      "job-cancelled",
    );

    expect(result.cancelled).toBe(true);
    expect(markCancelled).toHaveBeenCalledWith(
      "preview",
      "job-cancelled",
      "[build-cancelled] Site build cancelled: superseded",
    );
    expect(announced).toEqual([]);
  });

  it("records unchanged inputs as skipped instead of successful", async () => {
    const markSuccess = mock(async () => undefined);
    const markSkipped = mock(async () => undefined);
    const run = build({
      siteBuilder: {
        build: mock(async () => ({
          success: true,
          skipped: true,
          outputDir: "/tmp/output",
          filesGenerated: 10,
          routesBuilt: 10,
        })),
      },
      statusService: recorder({ markSuccess, markSkipped }),
    });

    const result = await run(
      { outputDir: "/tmp/output", environment: "production" },
      "job-skipped",
    );

    expect(result).toMatchObject({ success: true, skipped: true });
    expect(markSkipped).toHaveBeenCalledWith("production", "job-skipped", 10);
    expect(markSuccess).not.toHaveBeenCalled();
    expect(announced).toEqual([]);
  });

  it("does not fail the build when a status write fails", async () => {
    const run = build({
      statusService: recorder({
        markSuccess: mock(async () => {
          throw new Error("runtime-state write failed");
        }),
      }),
    });

    const result = await run(
      { outputDir: "/tmp/output", environment: "production" },
      "job-write-fails",
    );

    expect(result).toMatchObject({ success: true });
    expect(announced.map((message) => message.topic)).toEqual([
      "site:build:completed",
    ]);
  });
});

/**
 * A whole recorder with the transitions a test cares about replaced.
 *
 * The handler optional-chains the service rather than each method, so a
 * partial one would be a different shape than production's.
 */
function recorder(
  overrides: Partial<BuildStatusRecorder>,
): BuildStatusRecorder {
  return {
    markBuilding: mock(async () => undefined),
    markSuccess: mock(async () => undefined),
    markSkipped: mock(async () => undefined),
    markCancelled: mock(async () => undefined),
    markFailure: mock(async () => undefined),
    ...overrides,
  };
}

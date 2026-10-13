import { describe, it, expect, beforeEach, mock } from "bun:test";
import { expectDefined } from "@brains/utils/expect-defined";
import { SiteBuildJobHandler } from "../../src/handlers/siteBuildJobHandler";
import type { ISiteBuilder } from "../../src/types/site-builder-types";
import type { SiteBuilderConfig } from "../../src/config";
import { UISlotRegistry } from "@brains/site-engine";
import {
  createSilentLogger,
  createMockMessageSender,
} from "@brains/test-utils";
import { CallbackProgressReporter } from "@brains/utils/progress";
import type { BuildStatusRecorder } from "../../src/handlers/siteBuildJobHandler";

describe("SiteBuildJobHandler", () => {
  let handler: SiteBuildJobHandler;
  let mockSiteBuilder: ISiteBuilder;

  beforeEach(() => {
    mockSiteBuilder = {
      build: mock(() =>
        Promise.resolve({
          success: true,
          outputDir: "/tmp/output",
          filesGenerated: 10,
          routesBuilt: 10,
        }),
      ),
    };

    const { sendMessage } = createMockMessageSender();

    const defaultSiteConfig: SiteBuilderConfig["siteInfo"] = {
      represents: "anchor",
      title: "Test Site",
      description: "Test Description",
    };

    handler = new SiteBuildJobHandler(createSilentLogger("test"), sendMessage, {
      siteBuilder: mockSiteBuilder,
      layouts: {},
      defaultSiteConfig,
      sharedImagesDir: "./dist/images",
    });
  });

  describe("validateAndParse", () => {
    it("should validate minimal required fields", () => {
      const data = {
        outputDir: "/path/to/output",
      };
      const result = handler.validateAndParse(data);

      expect(result).not.toBeNull();
      expect(result?.outputDir).toBe("/path/to/output");
      // Optional fields are undefined until defaults are applied in process()
      expect(result?.environment).toBeUndefined();
      expect(result?.enableContentGeneration).toBeUndefined();
    });

    it("should validate with all fields", () => {
      const data = {
        outputDir: "/path/to/output",
        workingDir: "/path/to/working",
        environment: "production",
        enableContentGeneration: true,
        siteConfig: {
          title: "Custom Title",
          description: "Custom Description",
        },
      };
      const result = handler.validateAndParse(data);

      expect(result).not.toBeNull();
      expect(result?.outputDir).toBe("/path/to/output");
      expect(result?.workingDir).toBe("/path/to/working");
      expect(result?.environment).toBe("production");
      expect(result?.enableContentGeneration).toBe(true);
      expect(result?.siteConfig?.title).toBe("Custom Title");
    });

    it("should return null for missing outputDir", () => {
      const result = handler.validateAndParse({});
      expect(result).toBeNull();
    });

    it("should return null for invalid environment", () => {
      const result = handler.validateAndParse({
        outputDir: "/path",
        environment: "invalid",
      });
      expect(result).toBeNull();
    });

    it("should allow undefined environment (defaults applied in process)", () => {
      const data = { outputDir: "/path/to/output" };
      const result = expectDefined(
        handler.validateAndParse(data),
        "validateAndParse result",
      );

      expect(result.environment).toBeUndefined();
    });

    it("should allow undefined enableContentGeneration (defaults applied in process)", () => {
      const data = { outputDir: "/path/to/output" };
      const result = expectDefined(
        handler.validateAndParse(data),
        "validateAndParse result",
      );

      expect(result.enableContentGeneration).toBeUndefined();
    });
  });

  describe("slot registry", () => {
    it("should pass the slots asked for at build time to siteBuilder.build()", async () => {
      const slotRegistry = new UISlotRegistry();
      slotRegistry.register("footer-top", {
        pluginId: "newsletter",
        render: () => null,
      });

      let capturedOptions: { slots?: unknown } | undefined;

      const mockSiteBuilderWithSlots: ISiteBuilder = {
        build: async (options) => {
          capturedOptions = options;
          return {
            success: true,
            outputDir: "/tmp/output",
            filesGenerated: 10,
            routesBuilt: 10,
          };
        },
      };

      const { sendMessage: slotsSendMessage } = createMockMessageSender();
      const defaultSiteConfig: SiteBuilderConfig["siteInfo"] = {
        represents: "anchor",
        title: "Test Site",
        description: "Test Description",
      };

      const handlerWithSlots = new SiteBuildJobHandler(
        createSilentLogger("test"),
        slotsSendMessage,
        {
          siteBuilder: mockSiteBuilderWithSlots,
          layouts: {},
          defaultSiteConfig,
          sharedImagesDir: "./dist/images",
          getSlots: async (): Promise<UISlotRegistry> => slotRegistry,
        },
      );

      const progressReporter = CallbackProgressReporter.from(async () => {});
      if (!progressReporter) throw new Error("Expected progress reporter");

      await handlerWithSlots.process(
        { outputDir: "/tmp/output" },
        "job-123",
        progressReporter,
      );

      expect(capturedOptions).toBeDefined();
      expect(capturedOptions?.slots).toBe(slotRegistry);
    });
  });

  it("records a cancelled build without emitting completion", async () => {
    const markCancelled = mock(async () => undefined);
    // All four transitions, because the handler optional-chains the service
    // rather than each method. Only markCancelled is asserted; the rest are
    // present so the recorder is a whole one, checked rather than asserted.
    const statusService: BuildStatusRecorder = {
      markBuilding: mock(async () => undefined),
      markSuccess: mock(async () => undefined),
      markSkipped: mock(async () => undefined),
      markFailure: mock(async () => undefined),
      markCancelled,
    };
    const cancelledBuilder: ISiteBuilder = {
      build: mock(async () => ({
        success: false,
        cancelled: true,
        outputDir: "/tmp/output",
        filesGenerated: 0,
        routesBuilt: 0,
        errors: ["[build-cancelled] Site build cancelled: superseded"],
      })),
    };
    const { sendMessage, sentMessages } = createMockMessageSender();
    const cancelledHandler = new SiteBuildJobHandler(
      createSilentLogger("test"),
      sendMessage,
      {
        siteBuilder: cancelledBuilder,
        layouts: {},
        defaultSiteConfig: {
          represents: "anchor",
          title: "Test Site",
          description: "Test Description",
        },
        sharedImagesDir: "./dist/images",
        statusService,
      },
    );
    const progressReporter = CallbackProgressReporter.from(async () => {});
    if (!progressReporter) throw new Error("Expected progress reporter");

    const result = await cancelledHandler.process(
      { outputDir: "/tmp/output", environment: "preview" },
      "job-cancelled",
      progressReporter,
    );

    expect(result.cancelled).toBe(true);
    expect(markCancelled).toHaveBeenCalledWith(
      "preview",
      "job-cancelled",
      "[build-cancelled] Site build cancelled: superseded",
    );
    expect(
      sentMessages.some((message) => message.type === "site:build:completed"),
    ).toBe(false);
  });

  for (const [label, superseded, completes] of [
    [
      "completes a superseded build: the newer build serves its request",
      true,
      true,
    ],
    [
      "fails a build cancelled for another reason, so the queue retries it",
      false,
      false,
    ],
  ] as const) {
    it(label, async () => {
      const builder: ISiteBuilder = {
        build: mock(async () => ({
          success: false,
          cancelled: true,
          ...(superseded && { superseded: true }),
          outputDir: "/tmp/output",
          filesGenerated: 0,
          routesBuilt: 0,
          errors: ["[build-cancelled] Site build cancelled"],
        })),
      };
      const { sendMessage } = createMockMessageSender();
      const handler = new SiteBuildJobHandler(
        createSilentLogger("test"),
        sendMessage,
        {
          siteBuilder: builder,
          layouts: {},
          defaultSiteConfig: {
            represents: "anchor",
            title: "Test Site",
            description: "Test Description",
          },
          sharedImagesDir: "./dist/images",
        },
      );
      const progressReporter = CallbackProgressReporter.from(async () => {});
      if (!progressReporter) throw new Error("Expected progress reporter");

      const result = await handler.process(
        { outputDir: "/tmp/output", environment: "preview" },
        "job-cancelled",
        progressReporter,
      );

      expect(result.success).toBe(completes);
      expect(result.cancelled).toBe(true);
    });
  }

  it("records unchanged inputs as skipped instead of successful", async () => {
    const markSuccess = mock(async () => undefined);
    const markSkipped = mock(async () => undefined);
    const statusService: BuildStatusRecorder = {
      markBuilding: mock(async () => undefined),
      markSuccess,
      markSkipped,
      markFailure: mock(async () => undefined),
      markCancelled: mock(async () => undefined),
    };
    const unchangedBuilder: ISiteBuilder = {
      build: mock(async () => ({
        success: true,
        skipped: true,
        outputDir: "/tmp/output",
        filesGenerated: 10,
        routesBuilt: 10,
      })),
    };
    const { sendMessage, sentMessages } = createMockMessageSender();
    const unchangedHandler = new SiteBuildJobHandler(
      createSilentLogger("test"),
      sendMessage,
      {
        siteBuilder: unchangedBuilder,
        layouts: {},
        defaultSiteConfig: {
          represents: "anchor",
          title: "Test Site",
          description: "Test Description",
        },
        sharedImagesDir: "./dist/images",
        statusService,
      },
    );
    const progressReporter = CallbackProgressReporter.from(async () => {});
    if (!progressReporter) throw new Error("Expected progress reporter");

    const result = await unchangedHandler.process(
      { outputDir: "/tmp/output", environment: "production" },
      "job-skipped",
      progressReporter,
    );

    expect(result).toMatchObject({ success: true, skipped: true });
    expect(markSkipped).toHaveBeenCalledWith("production", "job-skipped", 10);
    expect(markSuccess).not.toHaveBeenCalled();
    expect(
      sentMessages.some((message) => message.type === "site:build:completed"),
    ).toBe(false);
  });

  it("does not fail the build when a status write fails", async () => {
    const statusService: BuildStatusRecorder = {
      markBuilding: mock(async () => undefined),
      markSuccess: mock(async () => {
        throw new Error("runtime-state write failed");
      }),
      markSkipped: mock(async () => undefined),
      markFailure: mock(async () => undefined),
      markCancelled: mock(async () => undefined),
    };
    const { sendMessage, sentMessages } = createMockMessageSender();
    const failingWriteHandler = new SiteBuildJobHandler(
      createSilentLogger("test"),
      sendMessage,
      {
        siteBuilder: mockSiteBuilder,
        layouts: {},
        defaultSiteConfig: {
          represents: "anchor",
          title: "Test Site",
          description: "Test Description",
        },
        sharedImagesDir: "./dist/images",
        statusService,
      },
    );
    const progressReporter = CallbackProgressReporter.from(async () => {});
    if (!progressReporter) throw new Error("Expected progress reporter");

    const result = await failingWriteHandler.process(
      { outputDir: "/tmp/output", environment: "production" },
      "job-write-fails",
      progressReporter,
    );

    expect(result).toMatchObject({ success: true });
    expect(
      sentMessages.some((message) => message.type === "site:build:completed"),
    ).toBe(true);
  });
});

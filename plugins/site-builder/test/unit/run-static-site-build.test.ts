import { describe, expect, it, mock } from "bun:test";
import { ProgressReporter } from "@brains/utils";
import type {
  BuildContext,
  StaticSiteBuilder,
} from "../../src/lib/static-site-builder";
import { runStaticSiteBuild } from "../../src/lib/run-static-site-build";

const buildContext: BuildContext = {
  routes: [],
  siteConfig: {
    title: "Test Site",
    description: "Test Description",
  },
  getContent: async () => null,
  getViewTemplate: () => undefined,
  layouts: {},
  getSiteLayoutInfo: async () => ({
    title: "Test Site",
    description: "Test Description",
    navigation: {
      primary: [],
      secondary: [],
    },
    copyright: "© Test Site",
  }),
};

describe("runStaticSiteBuild", () => {
  it("scales renderer progress events into the static build progress range", async () => {
    const report = mock(async () => undefined);
    const reporter = ProgressReporter.from(report);
    if (!reporter) {
      throw new Error("Expected progress reporter");
    }
    const staticSiteBuilder: StaticSiteBuilder = {
      clean: mock(async () => undefined),
      build: mock(async (_context, onProgress) => {
        onProgress({ message: "start", progress: 1, total: 4 });
        onProgress({ message: "done", progress: 4, total: 4 });
      }),
    };

    await runStaticSiteBuild({
      staticSiteBuilder,
      buildContext,
      reporter,
    });

    expect(report).toHaveBeenCalledWith({
      message: "start",
      progress: 87.5,
      total: 100,
    });
    expect(report).toHaveBeenCalledWith({
      message: "done",
      progress: 95,
      total: 100,
    });
  });
});

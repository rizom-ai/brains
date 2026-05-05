import type { ProgressReporter } from "@brains/utils";
import type { BuildContext, StaticSiteBuilder } from "./static-site-builder";

const STATIC_BUILD_PROGRESS_START = 85;
const STATIC_BUILD_PROGRESS_END = 95;

export interface RunStaticSiteBuildOptions {
  staticSiteBuilder: StaticSiteBuilder;
  buildContext: BuildContext;
  reporter: ProgressReporter | undefined;
}

export async function runStaticSiteBuild(
  options: RunStaticSiteBuildOptions,
): Promise<void> {
  const subReporter = options.reporter?.createSub({
    scale: {
      start: STATIC_BUILD_PROGRESS_START,
      end: STATIC_BUILD_PROGRESS_END,
    },
  });

  await options.staticSiteBuilder.build(
    options.buildContext,
    (notification) => {
      subReporter?.report(notification).catch(() => {
        // Ignore progress reporting errors
      });
    },
  );
}

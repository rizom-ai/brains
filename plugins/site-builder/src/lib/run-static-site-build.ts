import type { ProgressReporter } from "@brains/utils";
import type { BuildContext, StaticSiteBuilder } from "./static-site-builder";

const STATIC_BUILD_PROGRESS_START = 85;
const STATIC_BUILD_PROGRESS_RANGE = 10;
const STATIC_BUILD_EXTRA_STEPS = 4; // start + tailwind + assets + hydration

export interface RunStaticSiteBuildOptions {
  staticSiteBuilder: StaticSiteBuilder;
  buildContext: BuildContext;
  reporter: ProgressReporter | undefined;
}

export async function runStaticSiteBuild(
  options: RunStaticSiteBuildOptions,
): Promise<void> {
  let buildStep = 0;
  const totalBuildSteps =
    options.buildContext.routes.length + STATIC_BUILD_EXTRA_STEPS;

  await options.staticSiteBuilder.build(options.buildContext, (message) => {
    buildStep++;
    const stepProgress =
      STATIC_BUILD_PROGRESS_START +
      Math.round((buildStep / totalBuildSteps) * STATIC_BUILD_PROGRESS_RANGE);

    options.reporter
      ?.report({ message, progress: stepProgress, total: 100 })
      .catch(() => {
        // Ignore progress reporting errors
      });
  });
}

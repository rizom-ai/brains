import type { ProgressReporter } from "@brains/utils/progress";
import type { BuildContext, StaticSiteBuilder } from "./static-site-builder";

const STATIC_BUILD_PROGRESS_START = 85;
const STATIC_BUILD_PROGRESS_END = 95;

export interface RunStaticSiteBuildOptions {
  staticSiteBuilder: StaticSiteBuilder;
  buildContext: BuildContext;
  reporter: ProgressReporter | undefined;
  signal: AbortSignal;
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

  options.signal.throwIfAborted();
  await options.staticSiteBuilder.build(
    options.buildContext,
    (notification) => {
      return subReporter?.report(notification).catch(() => {
        // Progress is diagnostic, but the renderer must join the attempt before
        // releasing its concurrency slot or completing the build.
      });
    },
    options.signal,
  );
  options.signal.throwIfAborted();
}

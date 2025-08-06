import type {
  StaticSiteBuilder,
  StaticSiteBuilderFactory,
  StaticSiteBuilderOptions,
  BuildContext,
} from "../../src/lib/static-site-builder";

export class MockStaticSiteBuilder implements StaticSiteBuilder {
  private hasBuildFlag = false;
  private buildContext: BuildContext | undefined;

  async build(
    context: BuildContext,
    onProgress: (message: string) => void,
  ): Promise<void> {
    onProgress("Mock build started");
    this.buildContext = context;
    this.hasBuildFlag = true;
    onProgress("Mock build completed");
  }

  async clean(): Promise<void> {
    this.hasBuildFlag = false;
    this.buildContext = undefined;
  }

  // Test helpers
  hasBuild(): boolean {
    return this.hasBuildFlag;
  }

  getBuildContext(): BuildContext | undefined {
    return this.buildContext;
  }
}

export const createMockStaticSiteBuilder: StaticSiteBuilderFactory = (
  _options: StaticSiteBuilderOptions,
) => {
  return new MockStaticSiteBuilder();
};

import type {
  StaticSiteBuilder,
  StaticSiteBuilderFactory,
} from "../../src/static-site-builder";

export class MockStaticSiteBuilder implements StaticSiteBuilder {
  private hasBuildFlag = false;
  private preparedFlag = false;
  private schemas = new Map<string, unknown>();
  private contentFiles = new Map<string, unknown>();

  async prepare(): Promise<void> {
    this.preparedFlag = true;
  }

  async generateContentConfig(schemas: Map<string, unknown>): Promise<void> {
    this.schemas = new Map(schemas);
  }

  async writeContentFile(
    collection: string,
    filename: string,
    content: unknown,
  ): Promise<void> {
    const key = `${collection}/${filename}`;
    this.contentFiles.set(key, content);
  }

  async build(onProgress?: (message: string) => void): Promise<void> {
    onProgress?.("Mock build started");
    this.hasBuildFlag = true;
    onProgress?.("Mock build completed");
  }

  hasBuild(): boolean {
    return this.hasBuildFlag;
  }

  async clean(): Promise<void> {
    this.hasBuildFlag = false;
    this.preparedFlag = false;
    this.schemas.clear();
    this.contentFiles.clear();
  }

  // Test helpers
  isPrepared(): boolean {
    return this.preparedFlag;
  }

  getSchemas(): Map<string, unknown> {
    return new Map(this.schemas);
  }

  getContentFiles(): Map<string, unknown> {
    return new Map(this.contentFiles);
  }
}

export const createMockStaticSiteBuilder: StaticSiteBuilderFactory = () => {
  return new MockStaticSiteBuilder();
};

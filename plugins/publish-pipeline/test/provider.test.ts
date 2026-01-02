import { describe, expect, it } from "bun:test";
import type { PublishProvider, PublishResult } from "@brains/utils";
import { InternalPublishProvider } from "../src/types/provider";

describe("InternalPublishProvider", () => {
  it("should have name 'internal'", () => {
    const provider = new InternalPublishProvider();
    expect(provider.name).toBe("internal");
  });

  it("should return id 'internal' when publishing", async () => {
    const provider = new InternalPublishProvider();
    // InternalPublishProvider ignores content/metadata since it's just a marker
    const result = await provider.publish("test content", { title: "Test" });

    expect(result).toEqual({ id: "internal" });
  });

  it("should implement PublishProvider interface", () => {
    const provider: PublishProvider = new InternalPublishProvider();

    expect(provider.name).toBeDefined();
    expect(typeof provider.publish).toBe("function");
  });
});

describe("PublishProvider interface", () => {
  it("should allow custom providers", async () => {
    const customProvider: PublishProvider = {
      name: "custom",
      async publish(_content, _metadata): Promise<PublishResult> {
        return {
          id: "custom-123",
          url: "https://example.com/post/123",
          metadata: { views: 0 },
        };
      },
      async validateCredentials(): Promise<boolean> {
        return true;
      },
    };

    const result = await customProvider.publish("content", {});
    expect(result.id).toBe("custom-123");
    expect(result.url).toBe("https://example.com/post/123");

    const valid = await customProvider.validateCredentials?.();
    expect(valid).toBe(true);
  });

  it("should allow providers without validateCredentials", async () => {
    const simpleProvider: PublishProvider = {
      name: "simple",
      async publish(): Promise<PublishResult> {
        return { id: "simple-1" };
      },
    };

    expect(simpleProvider.validateCredentials).toBeUndefined();
    const result = await simpleProvider.publish("content", {});
    expect(result.id).toBe("simple-1");
  });
});

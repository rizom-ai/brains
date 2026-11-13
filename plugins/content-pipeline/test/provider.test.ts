import { describe, expect, it } from "bun:test";
import type { PublishProvider } from "@brains/contracts";
import type { PublishResult } from "@brains/contracts";

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

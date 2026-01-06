import { describe, expect, it } from "bun:test";
import { resolveImage } from "../src/lib/image-resolver";
import type { Image } from "../src/schemas/image";
import { createMockEntityService } from "@brains/test-utils";

// Minimal 1x1 pixel PNG (base64)
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BASE64}`;

const mockImageEntity: Image = {
  id: "hero-image",
  entityType: "image",
  content: TINY_PNG_DATA_URL,
  metadata: {
    title: "Hero Image",
    alt: "A hero image for the blog",
    format: "png",
    width: 1,
    height: 1,
  },
  created: new Date().toISOString(),
  updated: new Date().toISOString(),
  contentHash: "abc123",
};

describe("resolveImage", () => {
  it("should resolve an existing image entity by ID", async () => {
    const entityService = createMockEntityService({
      entityTypes: ["image"],
      returns: { getEntity: mockImageEntity },
    });

    const result = await resolveImage("hero-image", entityService);

    expect(result).not.toBeNull();
    expect(result?.url).toBe(TINY_PNG_DATA_URL);
    expect(result?.alt).toBe("A hero image for the blog");
    expect(result?.title).toBe("Hero Image");
    expect(result?.width).toBe(1);
    expect(result?.height).toBe(1);
  });

  it("should return null for non-existent image", async () => {
    const entityService = createMockEntityService({
      entityTypes: ["image"],
      returns: { getEntity: null },
    });

    const result = await resolveImage("non-existent", entityService);

    expect(result).toBeNull();
  });

  it("should call getEntity with correct parameters", async () => {
    const entityService = createMockEntityService({
      entityTypes: ["image"],
      returns: { getEntity: mockImageEntity },
    });

    await resolveImage("hero-image", entityService);

    expect(entityService.getEntity).toHaveBeenCalledWith("image", "hero-image");
  });
});

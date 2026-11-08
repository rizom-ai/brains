import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { defineJobContract } from "../src/job-contract";
import {
  imageGenerateJobContract,
  imageRenderSourceJobContract,
} from "../src/image-jobs";

const input = z.strictObject({ prompt: z.string() });

describe("defineJobContract", () => {
  it("carries the full job type and its input schema, frozen", () => {
    const contract = defineJobContract({ type: "owner:render", input });

    expect(contract.type).toBe("owner:render");
    expect(contract.input).toBe(input);
    expect(Object.isFrozen(contract)).toBe(true);
  });

  it("refuses a job type without its owner's scope", () => {
    // An unscoped type is rescoped to whichever plugin enqueues it.
    expect(() => defineJobContract({ type: "render", input })).toThrow(
      "render",
    );
  });
});

describe("the image jobs", () => {
  it("are owned by the image plugin", () => {
    expect(imageGenerateJobContract.type).toBe("image:image-generate");
    expect(imageRenderSourceJobContract.type).toBe("image:image-render-source");
  });

  it("refuse an aspect ratio the image service does not make", () => {
    expect(
      imageGenerateJobContract.input.safeParse({
        prompt: "A lighthouse",
        aspectRatio: "2:1",
      }).success,
    ).toBe(false);
  });

  it("refuse a render with no source", () => {
    expect(
      imageRenderSourceJobContract.input.safeParse({
        sourceEntityType: "post",
        sourceEntityId: "",
        attachmentType: "og-image",
        imageId: "og-post-launch",
      }).success,
    ).toBe(false);
  });
});

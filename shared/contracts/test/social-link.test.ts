import { describe, expect, it } from "bun:test";
import {
  SOCIAL_LINK_PLATFORM_LABELS,
  socialLinkPlatformSchema,
  socialLinkSchema,
} from "../src";

describe("socialLinkPlatformSchema", () => {
  it("accepts a podcast next to the other platforms", () => {
    expect(
      socialLinkSchema.parse({
        platform: "podcast",
        url: "https://podcasts.apple.com/tw/podcast/id1674146827",
      }),
    ).toEqual({
      platform: "podcast",
      url: "https://podcasts.apple.com/tw/podcast/id1674146827",
    });
  });

  it("rejects a platform it does not know", () => {
    expect(socialLinkPlatformSchema.safeParse("myspace").success).toBeFalse();
  });

  it("names every platform", () => {
    expect(Object.keys(SOCIAL_LINK_PLATFORM_LABELS).sort()).toEqual(
      [...socialLinkPlatformSchema.options].sort(),
    );
    expect(SOCIAL_LINK_PLATFORM_LABELS.podcast).toBe("Podcast");
  });
});

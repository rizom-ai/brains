import { describe, expect, test } from "bun:test";
import {
  SOCIAL_LINK_PLATFORM_LABELS,
  type SiteLayoutInfo,
  type SocialLinkPlatform,
} from "../src";

describe("social link labels", () => {
  test("name a link's platform the way the platform writes itself", () => {
    const platforms: SocialLinkPlatform[] = [
      "github",
      "instagram",
      "linkedin",
      "podcast",
      "email",
      "website",
    ];
    expect(Object.keys(SOCIAL_LINK_PLATFORM_LABELS).sort()).toEqual(
      [...platforms].sort(),
    );
    expect(SOCIAL_LINK_PLATFORM_LABELS.linkedin).toBe("LinkedIn");
    expect(SOCIAL_LINK_PLATFORM_LABELS.podcast).toBe("Podcast");
  });

  test("cover every platform a layout can be handed", () => {
    const link: NonNullable<SiteLayoutInfo["socialLinks"]>[number] = {
      platform: "podcast",
      url: "https://podcasts.apple.com/tw/podcast/id1674146827",
    };
    expect(SOCIAL_LINK_PLATFORM_LABELS[link.platform]).toBe("Podcast");
  });
});

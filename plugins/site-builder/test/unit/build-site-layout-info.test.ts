import { describe, expect, test } from "bun:test";
import { buildSiteLayoutInfo } from "../../src/lib/build-site-layout-info";

const routeRegistry = {
  getNavigationItems: (): never[] => [],
};

const profileService = {
  getProfile: (): {
    socialLinks: Array<{ platform: "github"; url: string }>;
  } => ({
    socialLinks: [
      { platform: "github" as const, url: "https://github.com/ada" },
    ],
  }),
};

describe("buildSiteLayoutInfo", () => {
  test("uses anchor social links for the default anchor representation", () => {
    const result = buildSiteLayoutInfo(
      { title: "Ada", description: "Profile" },
      profileService,
      routeRegistry as never,
    );

    expect(result.represents).toBe("anchor");
    expect(result.socialLinks).toEqual(profileService.getProfile().socialLinks);
  });

  test("does not present anchor social links on a brain-representing site", () => {
    const result = buildSiteLayoutInfo(
      { represents: "brain", title: "Relay", description: "Shared brain" },
      profileService,
      routeRegistry as never,
    );

    expect(result.socialLinks).toBeUndefined();
  });
});

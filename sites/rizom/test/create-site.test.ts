import { describe, expect, test } from "bun:test";
import { createRizomSite } from "../src/create-site";

const baseOptions = {
  packageName: "@rizom/site-test",
  themeProfile: "product" as const,
  layout: (): null => null,
  routes: [],
};

describe("createRizomSite", () => {
  test("forwards entityDisplay onto the composed site definition", () => {
    const site = createRizomSite({
      ...baseOptions,
      entityDisplay: {
        post: { label: "Essay", navigation: { show: false } },
        deck: { label: "Talk", navigation: { show: false } },
      },
    });

    expect(site.entityDisplay?.["post"]?.label).toBe("Essay");
    expect(site.entityDisplay?.["deck"]?.label).toBe("Talk");
    expect(site.entityDisplay?.["post"]?.navigation?.show).toBe(false);
  });

  test("leaves the base entityDisplay map intact when none is given", () => {
    const site = createRizomSite(baseOptions);
    // The base rizom site ships an empty map, never undefined.
    expect(site.entityDisplay).toEqual({});
  });
});

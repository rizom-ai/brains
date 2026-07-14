import { describe, expect, it } from "bun:test";

import { requiredImages, sitePackagesFor, siteImageTag } from "../src/images";

describe("siteImageTag", () => {
  // The default path is sacred: an instance with no site override must build
  // and deploy the exact same `brain-{version}` image as the whole fleet.
  it("resolves no site packages to the plain brain-{version} tag", () => {
    expect(siteImageTag("0.2.0-alpha.148", [])).toBe("brain-0.2.0-alpha.148");
  });

  it("does not promote empty/whitespace entries to a site tag", () => {
    expect(siteImageTag("0.2.0-alpha.148", ["", "  "])).toBe(
      "brain-0.2.0-alpha.148",
    );
  });

  it("resolves a site override to a per-instance sites tag", () => {
    const tag = siteImageTag("0.2.0-alpha.148", [
      "@rizom/site-rizom-ai@0.2.0-alpha.148",
    ]);
    expect(tag).toMatch(/^brain-0\.2\.0-alpha\.148-sites-[0-9a-f]{12}$/);
  });

  it("is deterministic and order-independent", () => {
    const a = siteImageTag("0.2.0-alpha.148", ["@rizom/a@1", "@rizom/b@2"]);
    const b = siteImageTag("0.2.0-alpha.148", ["@rizom/b@2", "@rizom/a@1"]);
    expect(a).toBe(b);
  });

  it("never collides a site instance with the plain default image", () => {
    const plain = siteImageTag("0.2.0-alpha.148", []);
    const site = siteImageTag("0.2.0-alpha.148", [
      "@rizom/site-rizom-ai@0.2.0-alpha.148",
    ]);
    expect(site).not.toBe(plain);
  });

  it("produces different images for different package versions", () => {
    const a = siteImageTag("0.2.0-alpha.148", [
      "@rizom/site-rizom-ai@0.2.0-alpha.146",
    ]);
    const b = siteImageTag("0.2.0-alpha.148", [
      "@rizom/site-rizom-ai@0.2.0-alpha.148",
    ]);
    expect(a).not.toBe(b);
  });
});

describe("sitePackagesFor", () => {
  it("resolves no override to no packages", () => {
    expect(sitePackagesFor(undefined)).toEqual([]);
  });

  // A @rizom-scoped theme is an independently published npm package and is
  // installed alongside the site package at the same lockstep version.
  it("includes a @rizom-scoped theme at the site's version", () => {
    expect(
      sitePackagesFor({
        package: "@rizom/site-rizom-ai",
        version: "0.2.0-alpha.167",
        theme: "@rizom/theme-rizom-ai",
      }),
    ).toEqual([
      "@rizom/site-rizom-ai@0.2.0-alpha.167",
      "@rizom/theme-rizom-ai@0.2.0-alpha.167",
    ]);
  });

  // @brains/* themes are bundled inside @rizom/brain and must not be
  // npm-installed into the image.
  it("excludes bundled (@brains) themes", () => {
    expect(
      sitePackagesFor({
        package: "@rizom/site-rizom-ai",
        version: "0.2.0-alpha.167",
        theme: "@brains/theme-default",
      }),
    ).toEqual(["@rizom/site-rizom-ai@0.2.0-alpha.167"]);
  });
});

describe("requiredImages", () => {
  it("derives the declared image set from resolved users", () => {
    const images = requiredImages([
      // Two fleet-default users on the pilot version → one shared image.
      { brainVersion: "0.2.0-alpha.160" },
      { brainVersion: "0.2.0-alpha.160" },
      // A cohort running ahead needs its own default image.
      { brainVersion: "0.2.0-alpha.167" },
      // A site-override instance needs its own per-instance image.
      {
        brainVersion: "0.2.0-alpha.167",
        siteOverride: {
          package: "@rizom/site-rizom-ai",
          version: "0.2.0-alpha.167",
          theme: "@rizom/theme-rizom-ai",
        },
      },
    ]);

    expect(images).toHaveLength(3);
    expect(images.map((image) => image.tag)).toEqual(
      [...images.map((image) => image.tag)].sort(),
    );

    const plain = images.filter((image) => image.sitePackages.length === 0);
    expect(plain.map((image) => image.tag).sort()).toEqual([
      "brain-0.2.0-alpha.160",
      "brain-0.2.0-alpha.167",
    ]);

    const site = images.find((image) => image.sitePackages.length > 0);
    expect(site?.brainVersion).toBe("0.2.0-alpha.167");
    expect(site?.sitePackages).toEqual([
      "@rizom/site-rizom-ai@0.2.0-alpha.167",
      "@rizom/theme-rizom-ai@0.2.0-alpha.167",
    ]);
    expect(site?.tag).toBe(
      siteImageTag("0.2.0-alpha.167", site?.sitePackages ?? []),
    );
  });

  it("dedupes identical site-override instances into one image", () => {
    const override = {
      package: "@rizom/site-rizom-ai",
      version: "0.2.0-alpha.167",
    };
    const images = requiredImages([
      { brainVersion: "0.2.0-alpha.167", siteOverride: override },
      { brainVersion: "0.2.0-alpha.167", siteOverride: override },
    ]);
    expect(images).toHaveLength(1);
  });

  it("resolves an empty fleet to no images", () => {
    expect(requiredImages([])).toEqual([]);
  });
});

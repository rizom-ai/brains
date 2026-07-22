import { describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  requiredImages,
  resolveImageBuilds,
  runResolveMissingImages,
  sitePackagesFor,
  siteImageTag,
} from "../src/images";

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

describe("resolveImageBuilds", () => {
  const users = [
    { brainVersion: "0.2.0-alpha.160" },
    {
      brainVersion: "0.2.0-alpha.167",
      siteOverride: {
        package: "@rizom/site-rizom-ai",
        version: "0.2.0-alpha.167",
      },
    },
  ];

  it("filters the declared set to images missing from the registry", async () => {
    const checked: string[] = [];
    const builds = await resolveImageBuilds({
      users,
      imageExists: async (tag) => {
        checked.push(tag);
        return tag === "brain-0.2.0-alpha.160";
      },
    });

    expect(builds).toHaveLength(1);
    expect(builds[0]?.sitePackages).toEqual([
      "@rizom/site-rizom-ai@0.2.0-alpha.167",
    ]);
    expect(checked.sort()).toEqual(
      requiredImages(users)
        .map((image) => image.tag)
        .sort(),
    );
  });

  it("resolves to nothing when every declared image exists", async () => {
    const builds = await resolveImageBuilds({
      users,
      imageExists: async () => true,
    });
    expect(builds).toEqual([]);
  });

  // The manual/backfill path: explicit dispatch inputs force exactly that
  // build, skipping both the registry and the exists check.
  it("forces a single explicit build from dispatch inputs", async () => {
    const builds = await resolveImageBuilds({
      users,
      brainVersionInput: "0.2.0-alpha.169",
      sitePackagesInput:
        "@rizom/site-rizom-ai@0.2.0-alpha.169 @rizom/theme-rizom-ai@0.2.0-alpha.169",
      imageExists: async () => {
        throw new Error("must not be consulted for an explicit build");
      },
    });

    expect(builds).toEqual([
      {
        tag: siteImageTag("0.2.0-alpha.169", [
          "@rizom/site-rizom-ai@0.2.0-alpha.169",
          "@rizom/theme-rizom-ai@0.2.0-alpha.169",
        ]),
        brainVersion: "0.2.0-alpha.169",
        sitePackages: [
          "@rizom/site-rizom-ai@0.2.0-alpha.169",
          "@rizom/theme-rizom-ai@0.2.0-alpha.169",
        ],
      },
    ]);
  });
});

describe("runResolveMissingImages", () => {
  async function createPilotRepo(
    files: Record<string, string>,
  ): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "rover-pilot-images-"));
    for (const [relativePath, content] of Object.entries(files)) {
      const filePath = join(root, relativePath);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content);
    }
    return root;
  }

  it("emits a GitHub matrix of missing images from the declared state", async () => {
    const root = await createPilotRepo({
      "pilot.yaml": `schemaVersion: 1
brainVersion: 0.2.0-alpha.160
model: rover
githubOrg: rizom-ai
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
preset: core
aiApiKey: AI_API_KEY
gitSyncToken: GIT_SYNC_TOKEN
contentRepoAdminToken: CONTENT_REPO_ADMIN_TOKEN
agePublicKey: age1testpublickey
`,
      "users/alice.yaml": `handle: alice
discord:
  enabled: false
`,
      "users/new.yaml": `handle: new
siteOverride:
  package: "@rizom/site-rizom-ai"
  theme: "@rizom/theme-rizom-ai"
discord:
  enabled: false
`,
      "cohorts/pilot.yaml": `members:
  - alice
`,
      "cohorts/new-rizom-ai.yaml": `brainVersionOverride: 0.2.0-alpha.167
members:
  - new
`,
    });

    const outputs: Record<string, string> = {};
    const probed: string[] = [];
    const builds = await runResolveMissingImages({
      rootDir: root,
      imageRepository: "ghcr.io/rizom-ai/rover-pilot",
      env: {},
      runCommand: async (command, args) => {
        probed.push(`${command} ${args.join(" ")}`);
        // Only the fleet-default image exists in the registry.
        if (!args.join(" ").endsWith(":brain-0.2.0-alpha.160")) {
          throw new Error("manifest unknown");
        }
      },
      writeOutput: (key, value) => {
        outputs[key] = value;
      },
      log: () => {},
    });

    expect(builds).toHaveLength(1);
    expect(
      probed.every((line) => line.startsWith("docker manifest inspect")),
    ).toBe(true);
    const matrix = JSON.parse(outputs["images_json"] ?? "[]") as Array<{
      tag: string;
      brain_version: string;
      site_packages: string;
    }>;
    expect(matrix).toEqual([
      {
        tag: builds[0]?.tag ?? "",
        brain_version: "0.2.0-alpha.167",
        site_packages:
          "@rizom/site-rizom-ai@0.2.0-alpha.167 @rizom/theme-rizom-ai@0.2.0-alpha.167",
      },
    ]);
  });

  it("honors explicit dispatch inputs without touching the registry", async () => {
    const outputs: Record<string, string> = {};
    const builds = await runResolveMissingImages({
      // No pilot repo at this path — the registry must not be loaded.
      rootDir: "/nonexistent",
      imageRepository: "ghcr.io/rizom-ai/rover-pilot",
      env: {
        BRAIN_VERSION_INPUT: "0.2.0-alpha.169",
        SITE_PACKAGES_INPUT: "@rizom/site-rizom-ai@0.2.0-alpha.169",
      },
      runCommand: async () => {
        throw new Error("must not probe the registry for an explicit build");
      },
      writeOutput: (key, value) => {
        outputs[key] = value;
      },
      log: () => {},
    });

    expect(builds).toHaveLength(1);
    expect(JSON.parse(outputs["images_json"] ?? "[]")).toHaveLength(1);
  });
});

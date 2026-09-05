import { caughtError, createTempDir } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { describe, expect, it } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  imageTagExists,
  requiredImages,
  resolveImageBuilds,
  runResolveMissingImages,
  runtimeImageTag,
  sitePackagesFor,
} from "../src/images";

describe("runtimeImageTag", () => {
  it("uses one plain tag for every instance on a Brain version", () => {
    expect(runtimeImageTag("0.2.0-alpha.350")).toBe("brain-0.2.0-alpha.350");
  });
});

describe("sitePackagesFor", () => {
  it("resolves no override to no packages", () => {
    expect(sitePackagesFor(undefined)).toEqual([]);
  });

  it("includes an external theme at its own exact version", () => {
    expect(
      sitePackagesFor({
        package: "@rizom/site-rizom-ai",
        version: "0.2.0-alpha.167",
        theme: "@rizom/theme-rizom-ai",
        themeVersion: "0.2.0-alpha.165",
      }),
    ).toEqual([
      "@rizom/site-rizom-ai@0.2.0-alpha.167",
      "@rizom/theme-rizom-ai@0.2.0-alpha.165",
    ]);
  });

  it("refuses an external theme without an exact version", () => {
    expect(() =>
      sitePackagesFor({
        package: "@rizom/site-rizom-ai",
        version: "0.2.0-alpha.167",
        theme: "@rizom/theme-rizom-ai",
      }),
    ).toThrow("no explicit version pin");
  });

  // @brains/* themes are bundled inside @rizom/brain and must not be
  // npm-installed into the image.
  it("excludes bundled (@brains) themes", () => {
    expect(
      sitePackagesFor({
        package: "@rizom/site-rizom-ai",
        version: "0.2.0-alpha.167",
        theme: "@brains/theme-rizom",
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
      // A site override contributes packages to its version's shared image.
      {
        brainVersion: "0.2.0-alpha.167",
        siteOverride: {
          package: "@rizom/site-rizom-ai",
          version: "0.2.0-alpha.167",
          theme: "@rizom/theme-rizom-ai",
          themeVersion: "0.2.0-alpha.165",
        },
      },
    ]);

    expect(images).toHaveLength(2);
    expect(images.map((image) => image.tag)).toEqual(
      [...images.map((image) => image.tag)].sort(),
    );

    expect(images).toEqual([
      {
        tag: "brain-0.2.0-alpha.160",
        brainVersion: "0.2.0-alpha.160",
        sitePackages: [],
      },
      {
        tag: "brain-0.2.0-alpha.167",
        brainVersion: "0.2.0-alpha.167",
        sitePackages: [
          "@rizom/site-rizom-ai@0.2.0-alpha.167",
          "@rizom/theme-rizom-ai@0.2.0-alpha.165",
        ],
      },
    ]);
  });

  it("builds one shared image per version with the union of site packages", () => {
    const images = requiredImages([
      { brainVersion: "0.2.0-alpha.350" },
      {
        brainVersion: "0.2.0-alpha.350",
        siteOverride: {
          package: "@rizom/site-docs",
          version: "0.2.0-alpha.237",
          theme: "@rizom/theme-rizom-ai",
          themeVersion: "0.2.0-alpha.234",
        },
      },
      {
        brainVersion: "0.2.0-alpha.350",
        siteOverride: {
          package: "@rizom/site-rizom-ai",
          version: "0.2.0-alpha.238",
          theme: "@rizom/theme-rizom-ai",
          themeVersion: "0.2.0-alpha.234",
        },
      },
    ]);

    expect(images).toEqual([
      {
        tag: "brain-0.2.0-alpha.350",
        brainVersion: "0.2.0-alpha.350",
        sitePackages: [
          "@rizom/site-docs@0.2.0-alpha.237",
          "@rizom/site-rizom-ai@0.2.0-alpha.238",
          "@rizom/theme-rizom-ai@0.2.0-alpha.234",
        ],
      },
    ]);
  });

  it("rejects conflicting package pins in one shared version image", () => {
    expect(() =>
      requiredImages([
        {
          brainVersion: "0.2.0-alpha.350",
          siteOverride: {
            package: "@rizom/site-docs",
            version: "0.2.0-alpha.237",
            theme: "@rizom/theme-rizom-ai",
            themeVersion: "0.2.0-alpha.234",
          },
        },
        {
          brainVersion: "0.2.0-alpha.350",
          siteOverride: {
            package: "@rizom/site-rizom-ai",
            version: "0.2.0-alpha.238",
            theme: "@rizom/theme-rizom-ai",
            themeVersion: "0.2.0-alpha.235",
          },
        },
      ]),
    ).toThrow(/conflicting pins.*@rizom\/theme-rizom-ai/i);
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
  // build. Published tags stay immutable — an existing tag refuses to be
  // rebuilt unless overwrite is explicitly confirmed, because a same-tag
  // rebuild from a newer Dockerfile can strand the tag boot-broken.
  it("refuses to force-rebuild an existing tag without overwrite", () => {
    void expect(
      resolveImageBuilds({
        users,
        brainVersionInput: "0.2.0-alpha.169",
        imageExists: async () => true,
      }),
    ).rejects.toThrow(/immutable/);
  });

  it("force-rebuilds an existing tag when overwrite is confirmed", async () => {
    const builds = await resolveImageBuilds({
      users,
      brainVersionInput: "0.2.0-alpha.169",
      allowTagOverwrite: true,
      imageExists: async () => true,
    });
    expect(builds).toHaveLength(1);
    expect(builds[0]?.tag).toBe("brain-0.2.0-alpha.169");
  });

  it("forces a single explicit build from dispatch inputs", async () => {
    const builds = await resolveImageBuilds({
      users,
      brainVersionInput: "0.2.0-alpha.169",
      sitePackagesInput:
        "@rizom/site-rizom-ai@0.2.0-alpha.169 @rizom/theme-rizom-ai@0.2.0-alpha.169",
      imageExists: async () => false,
    });

    expect(builds).toEqual([
      {
        tag: "brain-0.2.0-alpha.169",
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
    const root = await createTempDir("rover-pilot-images-");
    for (const [relativePath, content] of Object.entries(files)) {
      const filePath = join(root, relativePath);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content);
    }
    return root;
  }

  it("emits a GitHub matrix of missing images from the declared state", async () => {
    const root = await createPilotRepo({
      "pilot.yaml": `brainVersion: 0.2.0-alpha.160
bundleContract: capability-bundles-v1
githubOrg: rizom-ai
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
bundles:
  - core
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
  version: 0.2.0-alpha.167
  theme: "@rizom/theme-rizom-ai"
  themeVersion: 0.2.0-alpha.165
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
        // Only the fleet-default image exists in the registry. Fails the way
        // runSubprocess does, so imageTagExists can tell an unknown manifest
        // from docker being unable to run at all.
        if (!args.join(" ").endsWith(":brain-0.2.0-alpha.160")) {
          throw new Error(`docker ${args.join(" ")} exited with code 1`);
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
    const matrix = z
      .array(
        z.looseObject({
          tag: z.string(),
          brain_version: z.string(),
          site_packages: z.string(),
        }),
      )
      .parse(JSON.parse(outputs["images_json"] ?? "[]"));
    expect(matrix).toEqual([
      {
        tag: "brain-0.2.0-alpha.167",
        brain_version: "0.2.0-alpha.167",
        site_packages:
          "@rizom/site-rizom-ai@0.2.0-alpha.167 @rizom/theme-rizom-ai@0.2.0-alpha.165",
      },
    ]);
  });

  it("honors explicit dispatch inputs without loading the pilot registry", async () => {
    // It does probe the image registry: that is how the tag-immutability guard
    // knows the tag is free. What it must not do is load the pilot repo, hence
    // the nonexistent rootDir. The previous name said "without touching the
    // registry" and its fake threw to enforce that, but the throw was
    // swallowed into "tag absent", so the claim went unchecked either way.
    const outputs: Record<string, string> = {};
    const probed: string[] = [];
    const builds = await runResolveMissingImages({
      // No pilot repo at this path — the pilot registry must not be loaded.
      rootDir: "/nonexistent",
      imageRepository: "ghcr.io/rizom-ai/rover-pilot",
      env: {
        BRAIN_VERSION_INPUT: "0.2.0-alpha.169",
        SITE_PACKAGES_INPUT: "@rizom/site-rizom-ai@0.2.0-alpha.169",
      },
      runCommand: async (command, args) => {
        probed.push(`${command} ${args.join(" ")}`);
        // The tag is free, reported the way runSubprocess reports it.
        throw new Error(`docker ${args.join(" ")} exited with code 1`);
      },
      writeOutput: (key, value) => {
        outputs[key] = value;
      },
      log: () => {},
    });

    expect(builds).toHaveLength(1);
    expect(builds[0]?.tag).toBe("brain-0.2.0-alpha.169");
    expect(JSON.parse(outputs["images_json"] ?? "[]")).toHaveLength(1);
    expect(probed).toHaveLength(1);
    expect(probed[0]).toContain("manifest inspect");
  });
});

describe("imageTagExists", () => {
  it("reports absent when the registry says the manifest is unknown", async () => {
    const exists = await imageTagExists(
      async () => {
        throw new Error("docker manifest inspect repo:tag exited with code 1");
      },
      "repo",
      "tag",
    );

    expect(exists).toBe(false);
  });

  it("reports present when the manifest resolves", async () => {
    const exists = await imageTagExists(async () => undefined, "repo", "tag");

    expect(exists).toBe(true);
  });

  it("raises rather than reporting absent when docker itself cannot run", async () => {
    // Answering "absent" here would let the caller's tag-immutability guard
    // pass and overwrite a published tag, which the guard exists to prevent.
    const spawnFailure = Object.assign(new Error("spawn docker ENOENT"), {
      code: "ENOENT",
    });

    const outcome = await imageTagExists(
      async () => {
        throw spawnFailure;
      },
      "repo",
      "tag",
    ).then(
      (value) => `reported ${value}`,
      (error: unknown) => caughtError(error).message,
    );

    expect(outcome).toBe("spawn docker ENOENT");
  });
});

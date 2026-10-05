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
  it("uses one plain tag for every instance on a Brain version without site pins", () => {
    expect(runtimeImageTag("0.2.0-alpha.350")).toBe("brain-0.2.0-alpha.350");
    expect(runtimeImageTag("0.2.0-alpha.350", [])).toBe(
      "brain-0.2.0-alpha.350",
    );
  });

  it("names an image by its Brain version and its exact site pins, in one order", () => {
    const pins = [
      "@rizom/theme-rizom-ai@0.2.0-alpha.235",
      "@rizom/site-rizom-ai@0.2.0-alpha.264",
    ];
    expect(runtimeImageTag("0.2.0-alpha.483", pins)).toBe(
      "brain-0.2.0-alpha.483--rizom-site-rizom-ai-0.2.0-alpha.264--rizom-theme-rizom-ai-0.2.0-alpha.235",
    );
    expect(runtimeImageTag("0.2.0-alpha.483", [...pins].reverse())).toBe(
      runtimeImageTag("0.2.0-alpha.483", pins),
    );
    // A different pin is a different image.
    expect(
      runtimeImageTag("0.2.0-alpha.483", [
        "@rizom/site-rizom-ai@0.2.0-alpha.263",
        "@rizom/theme-rizom-ai@0.2.0-alpha.235",
      ]),
    ).not.toBe(runtimeImageTag("0.2.0-alpha.483", pins));
  });

  it("falls back to a digest of the pins when the spelled-out tag would exceed what a registry accepts", () => {
    const pins = Array.from(
      { length: 6 },
      (_, i) => `@rizom/site-with-a-long-name-${i}@0.2.0-alpha.${100 + i}`,
    );
    const tag = runtimeImageTag("0.2.0-alpha.483", pins);
    expect(tag.length).toBeLessThanOrEqual(128);
    expect(tag).toMatch(/^brain-0\.2\.0-alpha\.483--s[0-9a-f]{12}$/);
    expect(runtimeImageTag("0.2.0-alpha.483", [...pins].reverse())).toBe(tag);
  });

  it("spells every tag in what a registry accepts", () => {
    expect(
      runtimeImageTag("0.2.0-alpha.1", ["@acme/site_one@1.0.0-rc.1"]),
    ).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
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
  it("derives the declared image set from resolved users: one image per Brain version and site pin set", () => {
    const images = requiredImages([
      // Two fleet-default users on the pilot version → one shared plain image.
      { brainVersion: "0.2.0-alpha.160" },
      { brainVersion: "0.2.0-alpha.160" },
      // A cohort running ahead needs its own plain image.
      { brainVersion: "0.2.0-alpha.167" },
      // A site override needs its own image on its version, with its pins.
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

    expect(images).toHaveLength(3);
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
        sitePackages: [],
      },
      {
        tag: "brain-0.2.0-alpha.167--rizom-site-rizom-ai-0.2.0-alpha.167--rizom-theme-rizom-ai-0.2.0-alpha.165",
        brainVersion: "0.2.0-alpha.167",
        sitePackages: [
          "@rizom/site-rizom-ai@0.2.0-alpha.167",
          "@rizom/theme-rizom-ai@0.2.0-alpha.165",
        ],
      },
    ]);
  });

  it("gives each site its own image on a version, and the plain instances theirs", () => {
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
        sitePackages: [],
      },
      {
        tag: "brain-0.2.0-alpha.350--rizom-site-docs-0.2.0-alpha.237--rizom-theme-rizom-ai-0.2.0-alpha.234",
        brainVersion: "0.2.0-alpha.350",
        sitePackages: [
          "@rizom/site-docs@0.2.0-alpha.237",
          "@rizom/theme-rizom-ai@0.2.0-alpha.234",
        ],
      },
      {
        tag: "brain-0.2.0-alpha.350--rizom-site-rizom-ai-0.2.0-alpha.238--rizom-theme-rizom-ai-0.2.0-alpha.234",
        brainVersion: "0.2.0-alpha.350",
        sitePackages: [
          "@rizom/site-rizom-ai@0.2.0-alpha.238",
          "@rizom/theme-rizom-ai@0.2.0-alpha.234",
        ],
      },
    ]);
  });

  it("lets two sites pin a theme differently, each in its own image", () => {
    const images = requiredImages([
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
    ]);
    expect(images.map((image) => image.sitePackages)).toEqual([
      [
        "@rizom/site-docs@0.2.0-alpha.237",
        "@rizom/theme-rizom-ai@0.2.0-alpha.234",
      ],
      [
        "@rizom/site-rizom-ai@0.2.0-alpha.238",
        "@rizom/theme-rizom-ai@0.2.0-alpha.235",
      ],
    ]);
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
      verifyImage: async () => {},
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
      verifyImage: async () => {},
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
        verifyImage: async () => {},
        brainVersionInput: "0.2.0-alpha.169",
        imageExists: async () => true,
      }),
    ).rejects.toThrow(/immutable/);
  });

  it("force-rebuilds an existing tag when overwrite is confirmed", async () => {
    const builds = await resolveImageBuilds({
      users,
      verifyImage: async () => {},
      brainVersionInput: "0.2.0-alpha.169",
      allowTagOverwrite: true,
      imageExists: async () => true,
    });
    expect(builds).toHaveLength(1);
    expect(builds[0]?.tag).toBe("brain-0.2.0-alpha.169");
  });

  it("forces a single explicit build of exactly the dispatched pins", async () => {
    const builds = await resolveImageBuilds({
      users,
      verifyImage: async () => {},
      brainVersionInput: "0.2.0-alpha.169",
      sitePackagesInput: "@rizom/theme-rizom-ai@0.2.0-alpha.169",
      imageExists: async () => false,
    });

    expect(builds).toEqual([
      {
        tag: "brain-0.2.0-alpha.169--rizom-theme-rizom-ai-0.2.0-alpha.169",
        brainVersion: "0.2.0-alpha.169",
        sitePackages: ["@rizom/theme-rizom-ai@0.2.0-alpha.169"],
      },
    ]);
  });

  it("rejects dispatched pins that name one package twice", () => {
    void expect(
      resolveImageBuilds({
        users,
        verifyImage: async () => {},
        brainVersionInput: "0.2.0-alpha.169",
        sitePackagesInput:
          "@rizom/theme-rizom-ai@0.2.0-alpha.169 @rizom/theme-rizom-ai@0.2.0-alpha.168",
        imageExists: async () => false,
      }),
    ).rejects.toThrow(/conflicting pins/);
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
        if (
          args[0] === "manifest" &&
          !args.join(" ").endsWith(":brain-0.2.0-alpha.160")
        ) {
          throw new Error(`docker ${args.join(" ")} exited with code 1`);
        }
      },
      writeOutput: (key, value) => {
        outputs[key] = value;
      },
      log: () => {},
    });

    expect(builds).toHaveLength(1);
    expect(probed.some((line) => line.startsWith("docker run"))).toBe(true);
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
        tag: "brain-0.2.0-alpha.167--rizom-site-rizom-ai-0.2.0-alpha.167--rizom-theme-rizom-ai-0.2.0-alpha.165",
        brain_version: "0.2.0-alpha.167",
        site_packages:
          "@rizom/site-rizom-ai@0.2.0-alpha.167 @rizom/theme-rizom-ai@0.2.0-alpha.165",
      },
    ]);
  });

  it("builds exactly the dispatched pins, before any user adopts the version", async () => {
    const root = await createPilotRepo({
      "pilot.yaml": `brainVersion: 0.2.0-alpha.160
bundleContract: capability-bundles-v1
githubOrg: rizom-ai
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
bundles: [core]
aiApiKey: AI_API_KEY
gitSyncToken: GIT_SYNC_TOKEN
contentRepoAdminToken: CONTENT_REPO_ADMIN_TOKEN
agePublicKey: age1testpublickey
`,
      "users/alice.yaml": `handle: alice
siteOverride:
  package: "@rizom/site-docs"
  version: 0.2.0-alpha.167
discord:
  enabled: false
`,
      "cohorts/pilot.yaml": "members: [alice]\n",
    });
    const outputs: Record<string, string> = {};
    const probed: string[] = [];
    const builds = await runResolveMissingImages({
      rootDir: root,
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
    expect(builds[0]?.tag).toBe(
      "brain-0.2.0-alpha.169--rizom-site-rizom-ai-0.2.0-alpha.169",
    );
    expect(builds[0]?.sitePackages).toEqual([
      "@rizom/site-rizom-ai@0.2.0-alpha.169",
    ]);
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

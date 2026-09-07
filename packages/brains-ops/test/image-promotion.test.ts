import { describe, expect, it } from "bun:test";
import { Script } from "node:vm";
import { verifyRuntimeImage } from "../src/image-inventory";
import {
  requiredImages,
  resolveImageBuilds,
  type RequiredImage,
} from "../src/images";

const users = [
  { brainVersion: "0.2.0-alpha.368" },
  {
    brainVersion: "0.2.0-alpha.368",
    siteOverride: {
      package: "@rizom/site-docs",
      version: "0.2.0-alpha.239",
      theme: "@rizom/theme-rizom-ai",
      themeVersion: "0.2.0-alpha.235",
    },
  },
  {
    brainVersion: "0.2.0-alpha.371",
    siteOverride: {
      package: "@rizom/site-smoke-canary",
      version: "0.2.0-alpha.236",
      theme: "@rizom/theme-signal",
      themeVersion: "0.2.0-alpha.233",
    },
  },
];
const promoted = users.map((user) => ({
  ...user,
  brainVersion: "0.2.0-alpha.371",
}));

function canaryImage(): RequiredImage {
  const image = requiredImages(users).find(
    (image) => image.brainVersion === "0.2.0-alpha.371",
  );
  if (!image) throw new Error("Missing canary image");
  return image;
}

describe("smoke-to-fleet promotion", () => {
  it("builds the same fleet-complete image before and after promotion", () => {
    expect(requiredImages(promoted)).toEqual([canaryImage()]);
    expect(canaryImage().sitePackages).toEqual([
      "@rizom/site-docs@0.2.0-alpha.239",
      "@rizom/site-smoke-canary@0.2.0-alpha.236",
      "@rizom/theme-rizom-ai@0.2.0-alpha.235",
      "@rizom/theme-signal@0.2.0-alpha.233",
    ]);
    expect(requiredImages([...users].reverse())).toEqual(requiredImages(users));
  });

  it("reuses the smoke-tested complete image without building or changing its tag", async () => {
    const image = canaryImage();
    const verified: RequiredImage[] = [];
    const builds = await resolveImageBuilds({
      users: promoted,
      imageExists: async (tag) => tag === image.tag,
      verifyImage: async (candidate) => {
        verified.push(candidate);
      },
    });
    expect(builds).toEqual([]);
    expect(verified).toEqual([image]);
  });

  it("rejects promotion onto an existing smoke-only image", () => {
    void expect(
      resolveImageBuilds({
        users: promoted,
        imageExists: async () => true,
        verifyImage: async (image) => {
          if (
            image.sitePackages.some((spec) =>
              spec.startsWith("@rizom/site-docs@"),
            )
          ) {
            throw new Error("Missing docs package");
          }
        },
      }),
    ).rejects.toThrow("Missing docs package");
  });

  it("checks older images against their adopters, not packages from other cohorts", async () => {
    const verified: RequiredImage[] = [];
    const builds = await resolveImageBuilds({
      users,
      imageExists: async (tag) => tag === "brain-0.2.0-alpha.368",
      verifyImage: async (image) => {
        verified.push(image);
      },
    });
    expect(builds).toEqual([canaryImage()]);
    expect(verified[0]?.sitePackages).toEqual([
      "@rizom/site-docs@0.2.0-alpha.239",
      "@rizom/theme-rizom-ai@0.2.0-alpha.235",
    ]);
  });

  it("rejects conflicting pins even when their owners run different Brain versions", () => {
    expect(() =>
      requiredImages([
        ...users,
        {
          brainVersion: "0.2.0-alpha.369",
          siteOverride: {
            package: "@rizom/site-docs",
            version: "0.2.0-alpha.240",
          },
        },
      ]),
    ).toThrow("conflicting pins");
  });
});

describe("runtime image inventory gate", () => {
  const image: RequiredImage = {
    tag: "brain-0.2.0-alpha.371",
    brainVersion: "0.2.0-alpha.371",
    sitePackages: ["@rizom/site-docs@0.2.0-alpha.239"],
  };

  async function check(
    manifests: Record<string, { name: string; version: string }>,
  ): Promise<void> {
    await verifyRuntimeImage("registry/fleet", image, async (command, args) => {
      expect(command).toBe("docker");
      expect(args).toContain("registry/fleet:brain-0.2.0-alpha.371");
      expect(args.slice(0, 8)).toEqual([
        "run",
        "--rm",
        "--pull",
        "always",
        "--network",
        "none",
        "--read-only",
        "--user",
      ]);
      expect(args).toContain("no-new-privileges");
      const source = args[args.indexOf("-e") + 1];
      if (!source) throw new Error("Missing verification script");
      // Execute the actual in-container check with manifests, not package code.
      const execution: unknown = new Script(
        `(async () => {${source}})()`,
      ).runInNewContext({
        process: { argv: [args.at(-1)] },
        Bun: {
          file: (
            path: string,
          ): { json: () => Promise<{ name: string; version: string }> } => ({
            json: async (): Promise<{ name: string; version: string }> => {
              const manifest = manifests[path];
              if (!manifest) throw new Error(`Missing ${path}`);
              return manifest;
            },
          }),
        },
      });
      await execution;
    });
  }

  const manifests = {
    "/app/node_modules/@rizom/brain/package.json": {
      name: "@rizom/brain",
      version: "0.2.0-alpha.371",
    },
    "/app/node_modules/@rizom/site-docs/package.json": {
      name: "@rizom/site-docs",
      version: "0.2.0-alpha.239",
    },
  };

  it("accepts exact installed core and site versions", async () => {
    await check(manifests);
  });

  it("rejects missing packages", () => {
    void expect(check({})).rejects.toThrow("refusing image reuse");
  });

  it("rejects a mismatched package version", () => {
    void expect(
      check({
        ...manifests,
        "/app/node_modules/@rizom/site-docs/package.json": {
          name: "@rizom/site-docs",
          version: "0.2.0-alpha.238",
        },
      }),
    ).rejects.toThrow("refusing image reuse");
  });

  it("rejects a mismatched Brain version", () => {
    void expect(
      check({
        ...manifests,
        "/app/node_modules/@rizom/brain/package.json": {
          name: "@rizom/brain",
          version: "0.2.0-alpha.368",
        },
      }),
    ).rejects.toThrow("refusing image reuse");
  });

  it("fails closed on pull or execution errors", () => {
    void expect(
      verifyRuntimeImage("registry/fleet", image, async () => {
        throw new Error("Registry unavailable");
      }),
    ).rejects.toThrow("refusing image reuse");
  });
});

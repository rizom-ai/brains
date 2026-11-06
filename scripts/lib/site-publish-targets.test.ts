import { describe, expect, test } from "bun:test";
import { getPackages } from "@manypkg/get-packages";
import { join } from "node:path";
import {
  findSitePublishTargets,
  type WorkspacePackage,
} from "./site-publish-targets";

const publishManifest = { prepack: "publish-manifest prepare" };
const brainPeer = { "@rizom/brain": "^0.2.0-alpha.1" };

function workspacePackage(
  name: string,
  manifest: Record<string, unknown> = {},
): WorkspacePackage {
  const packageJson = {
    name,
    version: "1.0.0",
    scripts: publishManifest,
    publishPeerDependencies: brainPeer,
    ...manifest,
  };
  return { dir: `/repo/${name}`, packageJson };
}

describe("finding deployable site and theme packages", () => {
  test("targets public site and theme packages prepared by publish-manifest", () => {
    expect(
      findSitePublishTargets([
        workspacePackage("@rizom/site-docs"),
        workspacePackage("@rizom/theme-default", { version: "2.0.0" }),
      ]),
    ).toEqual([
      {
        dir: "/repo/@rizom/site-docs",
        target: {
          name: "@rizom/site-docs",
          version: "1.0.0",
          brainRange: "^0.2.0-alpha.1",
        },
      },
      {
        dir: "/repo/@rizom/theme-default",
        target: {
          name: "@rizom/theme-default",
          version: "2.0.0",
          brainRange: "^0.2.0-alpha.1",
        },
      },
    ]);
  });

  test("skips private, unprepared and non-site/theme packages", () => {
    const targets = findSitePublishTargets([
      workspacePackage("@rizom/site-docs"),
      workspacePackage("@rizom/site-private", { private: true }),
      workspacePackage("@rizom/site-plain", { scripts: { build: "tsc" } }),
      workspacePackage("@rizom/site-unscripted", { scripts: undefined }),
      workspacePackage("@rizom/brain"),
      workspacePackage("@brains/site-docs"),
    ]);
    expect(targets.map(({ target }) => target.name)).toEqual([
      "@rizom/site-docs",
    ]);
  });

  test.each([
    ["no publish peers", { publishPeerDependencies: undefined }],
    ["no @rizom/brain peer", { publishPeerDependencies: {} }],
    [
      "a non-string @rizom/brain peer",
      { publishPeerDependencies: { "@rizom/brain": 1 } },
    ],
  ])("rejects a deployable package with %s", (_label, manifest) => {
    expect(() =>
      findSitePublishTargets([workspacePackage("@rizom/site-docs", manifest)]),
    ).toThrow(
      '@rizom/site-docs is a deployable site/theme package but does not declare publishPeerDependencies["@rizom/brain"]',
    );
  });

  test("fails when no package is deployable", () => {
    expect(() =>
      findSitePublishTargets([workspacePackage("@rizom/brain")]),
    ).toThrow("No deployable site/theme compatibility targets found");
  });

  test("finds the repository's site and theme packages", async () => {
    const { packages } = await getPackages(join(import.meta.dir, "..", ".."));
    const names = findSitePublishTargets(packages).map(
      ({ target }) => target.name,
    );
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(name).toMatch(/^@rizom\/(site|theme)-/);
    }
  });
});

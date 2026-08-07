import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPluginPackageDefinition } from "@brains/plugins";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import {
  resolveBrainDefinitionDependencies,
  resolveInstalledPackageManifest,
} from "../src/installed-package-metadata";
import { registerBrainDefinitionPackages } from "../src/register-brain-definition-packages";

const temporaryDirectories: string[] = [];

function createPackage(
  root: string,
  name: string,
  manifest: Record<string, unknown>,
): string {
  const directory = join(root, "node_modules", ...name.split("/"));
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify({
      name,
      version: "0.1.0",
      type: "module",
      exports: { ".": "./index.js", "./model": "./index.js" },
      ...manifest,
    }),
  );
  writeFileSync(join(directory, "index.js"), "export default {};\n");
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("installed package metadata", () => {
  it("resolves package names and versions without source manifest imports", () => {
    const root = mkdtempSync(join(tmpdir(), "brain-package-metadata-"));
    temporaryDirectories.push(root);
    createPackage(root, "@fixture/reader-brain", {});

    const metadata = resolveInstalledPackageManifest(
      "@fixture/reader-brain/model",
      root,
    );

    expect(metadata).toMatchObject({
      name: "@fixture/reader-brain",
      version: "0.1.0",
      directory: join(root, "node_modules", "@fixture", "reader-brain"),
    });
  });

  it("selects direct definition dependencies by their Brain peer", () => {
    const root = mkdtempSync(join(tmpdir(), "brain-package-dependencies-"));
    temporaryDirectories.push(root);
    createPackage(root, "@rizom/brain", { version: "0.2.0-alpha.256" });
    createPackage(root, "@fixture/reader-brain", {
      dependencies: {
        "@fixture/reading-service": "0.1.0",
        "ordinary-library": "1.0.0",
      },
      peerDependencies: {
        "@rizom/brain": ">=0.2.0-alpha.0 <0.3.0",
      },
    });
    createPackage(root, "@fixture/reading-service", {
      peerDependencies: { "@rizom/brain": ">=0.2.0-alpha.0 <0.3.0" },
    });
    createPackage(root, "ordinary-library", {});

    expect(
      resolveBrainDefinitionDependencies("@fixture/reader-brain", root).map(
        ({ name }) => name,
      ),
    ).toEqual(["@fixture/reading-service"]);
  });

  it("rejects incompatible Brain peer ranges", () => {
    const root = mkdtempSync(join(tmpdir(), "brain-package-peer-"));
    temporaryDirectories.push(root);
    createPackage(root, "@rizom/brain", { version: "0.2.0-alpha.256" });
    createPackage(root, "@fixture/future-brain", {
      peerDependencies: { "@rizom/brain": ">=0.3.0 <0.4.0" },
    });

    expect(() =>
      resolveBrainDefinitionDependencies("@fixture/future-brain", root),
    ).toThrow(
      'Package "@fixture/future-brain@0.1.0" requires @rizom/brain ">=0.3.0 <0.4.0", but "0.2.0-alpha.256" is installed',
    );
  });

  it("requires a Brain peer on external brain definitions", () => {
    const root = mkdtempSync(join(tmpdir(), "brain-package-peer-missing-"));
    temporaryDirectories.push(root);
    createPackage(root, "@rizom/brain", { version: "0.2.0-alpha.256" });
    createPackage(root, "@fixture/peerless-brain", {});

    expect(() =>
      resolveBrainDefinitionDependencies("@fixture/peerless-brain", root),
    ).toThrow(
      'Package "@fixture/peerless-brain@0.1.0" must declare a @rizom/brain peer dependency',
    );
  });

  it("rejects named declarative package exports", async () => {
    const root = mkdtempSync(join(tmpdir(), "brain-package-named-export-"));
    temporaryDirectories.push(root);
    createPackage(root, "@rizom/brain", { version: "0.2.0-alpha.256" });
    createPackage(root, "@fixture/named-export-brain", {
      dependencies: { "@fixture/named-service": "0.1.0" },
      peerDependencies: {
        "@rizom/brain": ">=0.2.0-alpha.0 <0.3.0",
      },
    });
    createPackage(root, "@fixture/named-service", {
      peerDependencies: {
        "@rizom/brain": ">=0.2.0-alpha.0 <0.3.0",
      },
    });
    const definition = createPluginPackageDefinition({
      family: "service",
      id: "named-service",
      config: z.object({}),
      instantiate: () => [],
    });

    let message = "";
    try {
      await registerBrainDefinitionPackages(
        "@fixture/named-export-brain",
        { name: "named-export-brain", plugins: [] },
        root,
        async () => ({ named: definition }),
      );
    } catch (error) {
      message = getErrorMessage(error);
    }
    expect(message).toContain(
      'Plugin package "@fixture/named-service" must default-export its declarative package definition',
    );
  });

  it("reports the unresolved package and lookup directory", () => {
    const root = mkdtempSync(join(tmpdir(), "brain-package-missing-"));
    temporaryDirectories.push(root);

    expect(() =>
      resolveInstalledPackageManifest("@fixture/missing", root),
    ).toThrow(
      `Could not resolve installed package "@fixture/missing" from "${root}"`,
    );
  });
});

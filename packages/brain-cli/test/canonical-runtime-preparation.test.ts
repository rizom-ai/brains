import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { generateEntrypoint } from "@brains/app";
import {
  getAvailableModels,
  getModel,
  isBuiltinModel,
  PREPARED_CANONICAL_MODEL,
} from "../src/lib/model-registry";
import {
  resolveBrainPackageName,
  type BrainPackageResolutionOptions,
} from "@brains/app";

const packageDirectory = join(import.meta.dir, "..");
const packageJson = JSON.parse(
  readFileSync(join(packageDirectory, "package.json"), "utf8"),
) as {
  exports: Record<string, unknown>;
};
const buildScript = readFileSync(
  join(packageDirectory, "scripts", "build.ts"),
  "utf8",
);
const bundledEntrypoint = readFileSync(
  join(packageDirectory, "scripts", "entrypoint.ts"),
  "utf8",
);

const preparedOptions: BrainPackageResolutionOptions = {
  enableCanonicalDefinition: true,
};

describe("canonical runtime preparation", () => {
  test("publishes a typed canonical model subpath without registering it", () => {
    expect(packageJson.exports["./model"]).toEqual({
      types: "./dist/model.d.ts",
      import: "./dist/model.js",
    });
    expect(
      existsSync(join(packageDirectory, "src", "entries", "model.ts")),
    ).toBe(true);
    expect(buildScript).toContain('name: "model"');

    expect(PREPARED_CANONICAL_MODEL).toEqual({
      name: "brain",
      packageRef: "@rizom/brain/model",
      envSchemaName: "brain",
    });
    expect(getAvailableModels()).not.toContain("brain");
    expect(isBuiltinModel("brain")).toBe(false);
    expect(getModel("brain")).toBeUndefined();
    expect(bundledEntrypoint).not.toContain('registerModel("brain"');
  });

  test("keeps canonical package resolution behind an explicit preparation flag", () => {
    expect(resolveBrainPackageName("brain")).toBe("@brains/brain");
    expect(resolveBrainPackageName("brain", preparedOptions)).toBe(
      "@rizom/brain/model",
    );
    expect(resolveBrainPackageName("@rizom/brain", preparedOptions)).toBe(
      "@rizom/brain/model",
    );
    expect(resolveBrainPackageName("rover", preparedOptions)).toBe(
      "@brains/rover",
    );
    expect(resolveBrainPackageName("@brains/relay", preparedOptions)).toBe(
      "@brains/relay",
    );
  });

  test("prepares static canonical entrypoint generation without changing defaults", () => {
    const legacyDefault = generateEntrypoint("brain: brain\nbundles: [core]\n");
    const prepared = generateEntrypoint(
      "brain: brain\nbundles: [core]\n",
      preparedOptions,
    );

    expect(legacyDefault).toContain('import definition from "@brains/brain"');
    expect(prepared).toContain('import definition from "@rizom/brain/model"');
    expect(prepared).toContain("parseInstanceOverrides(yaml)");
  });

  test("prepares a packed consumer fixture without starting the model", () => {
    const fixtureDirectory = join(
      packageDirectory,
      "test",
      "fixtures",
      "canonical-packed-consumer",
    );
    const fixturePackage = readFileSync(
      join(fixtureDirectory, "package.json"),
      "utf8",
    );
    const fixtureConfig = readFileSync(
      join(fixtureDirectory, "brain.yaml"),
      "utf8",
    );
    const importSmoke = readFileSync(
      join(fixtureDirectory, "import-smoke.ts"),
      "utf8",
    );

    expect(fixturePackage).toContain("__RIZOM_BRAIN_TARBALL__");
    expect(fixtureConfig).toContain("brain: brain");
    expect(fixtureConfig).toContain("bundles:");
    expect(importSmoke).toContain('from "@rizom/brain/model"');
    expect(importSmoke).not.toContain("start");
  });

  test("retains the canonical bundled env schema before registry crossover", () => {
    const generatedSchemas = readFileSync(
      join(
        packageDirectory,
        "src",
        "lib",
        "generated",
        "bundled-model-env-schemas.ts",
      ),
      "utf8",
    );
    expect(generatedSchemas).toContain("brain:");
  });
});

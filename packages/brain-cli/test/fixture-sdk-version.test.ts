import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "@brains/utils/zod";
import {
  buildAndPackFixturePackage,
  installPackedConsumer,
  packPackages,
} from "./helpers/packed-consumer";

const manifestSchema = z.object({
  peerDependencies: z.record(z.string(), z.string()),
});

for (const version of ["0.2.0-alpha.358", "0.2.0"]) {
  test(`packed fixtures bind their peer to the tested ${version} artifact after versioning`, async () => {
    const root = await mkdtemp(join(tmpdir(), "fixture-sdk-version-"));
    const sdk = join(root, "sdk");
    const fixture = join(root, "fixture");
    const consumer = join(root, "consumer-source");
    await Promise.all([sdk, fixture, consumer].map((path) => mkdir(path)));
    const sourceManifest = JSON.stringify({
      name: "@fixture/version-bound",
      version: "0.1.0",
      private: true,
      type: "module",
      exports: "./dist/index.js",
      peerDependencies: { "@rizom/brain": "0.2.0-alpha.357" },
      devDependencies: {
        typescript:
          "file:" + join(import.meta.dir, "../../../node_modules/typescript"),
      },
    });
    try {
      await writeFile(
        join(sdk, "package.json"),
        JSON.stringify({
          name: "@rizom/brain",
          version,
          type: "module",
          exports: "./index.js",
        }),
      );
      await writeFile(
        join(sdk, "index.js"),
        "export const version = " + JSON.stringify(version) + ";",
      );
      await writeFile(join(fixture, "package.json"), sourceManifest);
      await writeFile(
        join(fixture, "index.ts"),
        "export default { id: 'version-bound' };\n",
      );
      await writeFile(
        join(fixture, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            target: "ESNext",
            module: "ESNext",
            outDir: "dist",
            declaration: true,
            skipLibCheck: true,
          },
          include: ["index.ts"],
        }),
      );
      await writeFile(
        join(consumer, "package.json"),
        JSON.stringify({
          name: "fixture-consumer",
          version: "1.0.0",
          private: true,
          dependencies: {
            "@rizom/brain": version,
            "@fixture/version-bound": "0.1.0",
          },
        }),
      );
      const tarballs = new Map(
        await packPackages([sdk], join(root, "tarballs"), {}),
      );
      tarballs.set(
        ...(await buildAndPackFixturePackage(
          fixture,
          join(root, "build"),
          join(root, "tarballs"),
          tarballs,
        )),
      );
      const installed = join(root, "installed");
      await installPackedConsumer(consumer, installed, tarballs);
      const packed = manifestSchema.parse(
        JSON.parse(
          await readFile(
            join(installed, "node_modules/@fixture/version-bound/package.json"),
            "utf8",
          ),
        ),
      );
      expect(packed.peerDependencies["@rizom/brain"]).toBe(version);
      expect(
        Bun.semver.satisfies(
          version,
          packed.peerDependencies["@rizom/brain"] ?? "",
        ),
      ).toBe(true);
      expect(await readFile(join(fixture, "package.json"), "utf8")).toBe(
        sourceManifest,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 120_000);
}

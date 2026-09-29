import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** The SDK's own tests, consumed through published entries without workspace paths. */
export async function writeAuthoringTestConsumer(
  directory: string,
): Promise<void> {
  const source = await readFile(
    join(import.meta.dir, "../../../brain-sdk/test/testing-entry.test.ts"),
    "utf8",
  );
  await writeFile(
    join(directory, "authoring.test.ts"),
    source.replaceAll("@brains/sdk/", "@rizom/brain/"),
  );
  await writeFile(
    join(directory, "tsconfig.authoring.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        exactOptionalPropertyTypes: true,
        noUncheckedIndexedAccess: true,
        // Match the existing consumer probes: Bun's test globals and Node's
        // declarations are not compatible under skipLibCheck:false. The test
        // source (including every negative capability assertion) is checked.
        skipLibCheck: true,
        module: "esnext",
        moduleResolution: "bundler",
        target: "es2022",
        lib: ["es2022", "dom"],
        types: ["bun"],
        noEmit: true,
      },
      include: ["authoring.test.ts"],
    }),
  );
}

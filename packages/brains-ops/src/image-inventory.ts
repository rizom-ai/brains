import type { RequiredImage } from "./image-types";
import { runSubprocess, type RunCommand } from "./run-subprocess";

// Read manifests, never import package code or start the Brain. Check actual
// installed versions rather than trusting build arguments or image labels.
const INVENTORY_CHECK = `
const specs = JSON.parse(process.argv.at(-1));
for (const spec of specs) {
  const separator = spec.lastIndexOf("@");
  const name = spec.slice(0, separator);
  const expected = spec.slice(separator + 1);
  const path = "/app/node_modules/" + name + "/package.json";
  const manifest = await Bun.file(path).json();
  if (manifest.name !== name || manifest.version !== expected) {
    throw new Error("Image requires " + spec + "; found " + manifest.name + "@" + manifest.version);
  }
}
`;

/** Verify a published image without starting an app or touching a fleet host. */
export async function verifyRuntimeImage(
  imageRepository: string,
  image: RequiredImage,
  run: RunCommand = runSubprocess,
): Promise<void> {
  const reference = `${imageRepository}:${image.tag}`;
  try {
    await run("docker", [
      "run",
      "--rm",
      "--pull",
      "always",
      "--network",
      "none",
      "--read-only",
      "--user",
      "65534:65534",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--entrypoint",
      "bun",
      reference,
      "-e",
      INVENTORY_CHECK,
      "--",
      JSON.stringify([
        `@rizom/brain@${image.brainVersion}`,
        ...image.sitePackages,
      ]),
    ]);
  } catch (cause) {
    throw new Error(
      `Cannot verify required packages in ${reference}; refusing image reuse. ` +
        "Do not overwrite a deployed tag. Inspect the image inventory and rollout plan.",
      { cause },
    );
  }
}

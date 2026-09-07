import { loadPilotRegistry } from "@rizom/ops";
import {
  requireEnv,
  runtimeImageTag,
  sitePackagesFor,
  verifyRuntimeImage,
} from "@rizom/ops/deploy";

const handle = requireEnv("HANDLE");
const registry = await loadPilotRegistry(process.cwd());
const user = registry.users.find((entry) => entry.handle === handle);
if (!user) throw new Error(`Unknown fleet handle: ${handle}`);

await verifyRuntimeImage(`ghcr.io/${requireEnv("GITHUB_REPOSITORY")}`, {
  tag: runtimeImageTag(user.brainVersion),
  brainVersion: user.brainVersion,
  sitePackages: sitePackagesFor(user.siteOverride),
});

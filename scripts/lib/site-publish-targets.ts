import type { PublishedCompatibilityTarget } from "@brains/build-tools";
import { z } from "@brains/utils/zod";

/** The slice of a @manypkg/get-packages package the scan reads. */
export interface WorkspacePackage {
  dir: string;
  packageJson: { name: string; version: string; private?: boolean };
}

export interface SitePublishTarget {
  dir: string;
  target: PublishedCompatibilityTarget;
}

const publishManifestPrepackSchema = z.object({
  scripts: z.object({ prepack: z.literal("publish-manifest prepare") }),
});

const brainPeerRangeSchema = z.object({
  publishPeerDependencies: z.object({ "@rizom/brain": z.string() }),
});

function isDeployableSiteOrTheme({ packageJson }: WorkspacePackage): boolean {
  return (
    packageJson.private !== true &&
    (packageJson.name.startsWith("@rizom/site-") ||
      packageJson.name.startsWith("@rizom/theme-")) &&
    publishManifestPrepackSchema.safeParse(packageJson).success
  );
}

/**
 * Public @rizom site and theme packages whose published manifest is prepared
 * by publish-manifest, with the @rizom/brain range each declares for publish.
 */
export function findSitePublishTargets(
  packages: readonly WorkspacePackage[],
): SitePublishTarget[] {
  const targets = packages
    .filter(isDeployableSiteOrTheme)
    .map(({ dir, packageJson }) => {
      const { name, version } = packageJson;
      const peers = brainPeerRangeSchema.safeParse(packageJson);
      if (!peers.success) {
        throw new Error(
          `${name} is a deployable site/theme package but does not declare publishPeerDependencies["@rizom/brain"]`,
        );
      }
      const brainRange = peers.data.publishPeerDependencies["@rizom/brain"];
      return { dir, target: { name, version, brainRange } };
    });

  if (targets.length === 0) {
    throw new Error("No deployable site/theme compatibility targets found");
  }
  return targets;
}

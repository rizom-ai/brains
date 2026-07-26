import packageJson from "../package.json";

/**
 * Deterministic identity of this canary build. Rendered on the homepage and
 * (minus the version) served as the public well-known marker so the site
 * canary can assert the externally-hosted package loaded, built, and deployed.
 */
export interface CanaryStatus {
  package: string;
  purpose: string;
  surface: string;
  version: string;
}

export const canaryStatus: CanaryStatus = {
  package: "@rizom/site-smoke-canary",
  purpose: "hosted-external-package-canary",
  surface: "smoke.rizom.ai",
  version: packageJson.version,
};

/**
 * Stable public marker written to `/.well-known/rover-site-canary.json`.
 * Excludes the version so its bytes stay identical across releases.
 */
export const canaryMarker: string = `${JSON.stringify(
  {
    package: canaryStatus.package,
    purpose: canaryStatus.purpose,
    surface: canaryStatus.surface,
  },
  null,
  2,
)}\n`;

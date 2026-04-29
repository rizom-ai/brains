import packageJson from "../package.json" with { type: "json" };

/**
 * Pre-v1 external plugin API marker.
 *
 * During alpha, the external plugin API compatibility marker tracks the
 * published @rizom/brain package version. Once the plugin API is declared
 * stable, this can move to an independent semver contract such as 1.0.0.
 */
export const PLUGIN_API_VERSION = packageJson.version;

/**
 * Filename of the build-accounting manifest the site builder writes into each
 * generation directory. It is internal state, never site content: the shared
 * webserver refuses to serve it and the HTTP route registry reserves its path,
 * both deriving from this constant. Renaming the file here keeps that
 * protection; a rename anywhere else would silently start serving it.
 */
export const SITE_BUILD_MANIFEST_FILE = ".site-build-manifest.json";

/** The manifest's URL path, reserved by the route registry and webserver. */
export const SITE_BUILD_MANIFEST_PATH: `/${typeof SITE_BUILD_MANIFEST_FILE}` = `/${SITE_BUILD_MANIFEST_FILE}`;

/** Payload for the SITE_CHANNELS.buildCompleted broadcast. */
export interface SiteBuildCompletedPayload {
  outputDir: string;
  environment: "preview" | "production";
  routesBuilt: number;
  siteConfig: {
    title?: string | undefined;
    description?: string | undefined;
    url?: string | undefined;
    copyright?: string | undefined;
    themeMode?: "light" | "dark" | undefined;
  };
  generateEntityUrl: (entityType: string, slug: string) => string;
}

/**
 * Payload for the SITE_CHANNELS.buildStaging broadcast, consumed by
 * extensions that write optional artifacts into staging.
 */
export interface SiteBuildStagingPayload extends SiteBuildCompletedPayload {
  /**
   * Report that an expected staged artifact could not be written.
   *
   * Staging is delivered as a broadcast, and the message bus logs and discards
   * whatever a subscriber throws. A producer that fails is therefore invisible
   * to the build, which would publish a generation missing the artifact and
   * still report success. Reporting here fails the build instead, leaving the
   * previously published generation active.
   */
  reportFailure: (detail: string) => void;
}

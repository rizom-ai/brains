import { z } from "@brains/utils/zod";
import { defineBusContract, type BusContract } from "./bus-contract";

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

type EntityUrlGenerator = (entityType: string, slug: string) => string;
type StagingFailureReporter = (detail: string) => void;

function isFunction(value: unknown): boolean {
  return typeof value === "function";
}

type SiteBuildStagingSchema = z.ZodObject<{
  outputDir: z.ZodString;
  environment: z.ZodEnum<{ preview: "preview"; production: "production" }>;
  routesBuilt: z.ZodNumber;
  siteConfig: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    url: z.ZodOptional<z.ZodString>;
    copyright: z.ZodOptional<z.ZodString>;
    themeMode: z.ZodOptional<z.ZodEnum<{ light: "light"; dark: "dark" }>>;
  }>;
  generateEntityUrl: z.ZodCustom<EntityUrlGenerator, EntityUrlGenerator>;
  reportFailure: z.ZodCustom<StagingFailureReporter, StagingFailureReporter>;
}>;

/**
 * What a site build hands the extensions that write optional artifacts into
 * its staging directory. The bus is in-process, so the callbacks travel as is.
 */
export const siteBuildStagingSchema: SiteBuildStagingSchema = z.object({
  outputDir: z.string(),
  environment: z.enum(["preview", "production"]),
  routesBuilt: z.number(),
  siteConfig: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    url: z.string().optional(),
    copyright: z.string().optional(),
    themeMode: z.enum(["light", "dark"]).optional(),
  }),
  generateEntityUrl: z.custom<EntityUrlGenerator>(isFunction),
  /**
   * Report that an expected staged artifact could not be written.
   *
   * A command has no answer, and an owner that throws is contained, so a
   * producer that fails would be invisible to the build, which would publish
   * a generation missing the artifact and still report success. Reporting
   * here fails the build instead, leaving the previously published
   * generation active.
   */
  reportFailure: z.custom<StagingFailureReporter>(isFunction),
});

export type SiteBuildStagingPayload = z.output<typeof siteBuildStagingSchema>;

/**
 * A site build asks every extension to write its artifacts into staging
 * (an RSS feed, EPUBs) and waits for all of them before it renders. Answer in
 * every process (`everyProcess`): builds run in the worker.
 */
export const siteBuildStagingContract: BusContract<
  SiteBuildStagingSchema,
  z.ZodVoid,
  "command"
> = defineBusContract({
  channel: "site:build:staging",
  request: siteBuildStagingSchema,
  response: z.void(),
  delivery: "command",
});

import { z } from "@brains/utils/zod";

/** Pure definition and configuration contracts shared with the app runtime. */
export { reasoningEffortSchema, type ReasoningEffort } from "@brains/contracts";

export const modeSchema: z.ZodEnum<{ eval: "eval" }> = z.enum(["eval"]);
export type BrainMode = z.output<typeof modeSchema>;

export const brainAnchorConfigKindSchema: z.ZodEnum<{
  person: "person";
  team: "team";
  organization: "organization";
}> = z.enum(["person", "team", "organization"]);
export type BrainAnchorConfigKind = z.output<
  typeof brainAnchorConfigKindSchema
>;

/**
 * Brain identity — who this brain is.
 * Pure data, no code references.
 */
export interface BrainIdentity {
  characterName: string;
  role: string;
  purpose: string;
  values: string[];
}

type ProviderToggleSchema = z.ZodPrefault<
  z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    provider: z.ZodDefault<z.ZodEnum<{ bunny: "bunny"; none: "none" }>>;
  }>
>;

type DeploymentConfigSchema = z.ZodObject<{
  provider: z.ZodDefault<z.ZodEnum<{ hetzner: "hetzner"; docker: "docker" }>>;
  serverSize: z.ZodDefault<z.ZodString>;
  location: z.ZodDefault<z.ZodString>;
  domain: z.ZodOptional<z.ZodString>;
  docker: z.ZodPrefault<
    z.ZodObject<{
      enabled: z.ZodDefault<z.ZodBoolean>;
      image: z.ZodOptional<z.ZodString>;
    }>
  >;
  ports: z.ZodPrefault<
    z.ZodObject<{
      default: z.ZodDefault<z.ZodNumber>;
      preview: z.ZodDefault<z.ZodNumber>;
      production: z.ZodDefault<z.ZodNumber>;
    }>
  >;
  cdn: ProviderToggleSchema;
  dns: ProviderToggleSchema;
  paths: z.ZodPrefault<
    z.ZodObject<{
      install: z.ZodOptional<z.ZodString>;
      data: z.ZodOptional<z.ZodString>;
    }>
  >;
}>;

// Deployment configuration schema
// This consolidates all deployment settings that were previously in deploy.config.json
export const deploymentConfigSchema: DeploymentConfigSchema = z.object({
  // Server configuration
  provider: z.enum(["hetzner", "docker"]).default("hetzner"),
  serverSize: z.string().default("cx33"),
  location: z.string().default("fsn1"),

  // Domain
  domain: z.string().optional(),

  // Docker configuration
  docker: z
    .object({
      enabled: z.boolean().default(true),
      image: z.string().optional(), // defaults to app name
    })
    .prefault({}),

  // Port configuration (also used by WebserverInterface)
  ports: z
    .object({
      default: z.number().default(3333),
      preview: z.number().default(4321),
      production: z.number().default(8080),
    })
    .prefault({}),

  // CDN configuration
  cdn: z
    .object({
      enabled: z.boolean().default(false),
      provider: z.enum(["bunny", "none"]).default("none"),
    })
    .prefault({}),

  // DNS configuration
  dns: z
    .object({
      enabled: z.boolean().default(false),
      provider: z.enum(["bunny", "none"]).default("none"),
    })
    .prefault({}),

  // Paths (with sensible defaults based on app name)
  paths: z
    .object({
      install: z.string().optional(), // defaults to /opt/{app-name}
      data: z.string().optional(), // defaults to /opt/{app-name}/data
    })
    .prefault({}),
});

export type DeploymentConfig = z.output<typeof deploymentConfigSchema>;
export type DeploymentConfigInput = z.input<typeof deploymentConfigSchema>;

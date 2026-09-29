import { z } from "@brains/utils/zod";

/** Pure definition/configuration contracts shared with the app runtime. */
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

export interface BrainIdentity {
  characterName: string;
  role: string;
  purpose: string;
  values: string[];
}

export const reasoningEffortSchema: z.ZodEnum<{
  none: "none";
  low: "low";
  medium: "medium";
  high: "high";
  xhigh: "xhigh";
  max: "max";
}> = z.enum(["none", "low", "medium", "high", "xhigh", "max"]);
export type ReasoningEffort = z.output<typeof reasoningEffortSchema>;

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
    z.ZodObject<
      {
        default: z.ZodDefault<z.ZodNumber>;
        production: z.ZodDefault<z.ZodNumber>;
      },
      z.core.$strict
    >
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

export const deploymentConfigSchema: DeploymentConfigSchema = z.object({
  provider: z.enum(["hetzner", "docker"]).default("hetzner"),
  serverSize: z.string().default("cx33"),
  location: z.string().default("fsn1"),
  domain: z.string().optional(),
  docker: z
    .object({
      enabled: z.boolean().default(true),
      image: z.string().optional(),
    })
    .prefault({}),
  ports: z
    .strictObject({
      default: z.number().default(3333),
      production: z.number().int().min(0).max(65535).default(8080),
    })
    .prefault({}),
  cdn: z
    .object({
      enabled: z.boolean().default(false),
      provider: z.enum(["bunny", "none"]).default("none"),
    })
    .prefault({}),
  dns: z
    .object({
      enabled: z.boolean().default(false),
      provider: z.enum(["bunny", "none"]).default("none"),
    })
    .prefault({}),
  paths: z
    .object({
      install: z.string().optional(),
      data: z.string().optional(),
    })
    .prefault({}),
});

export type DeploymentConfig = z.output<typeof deploymentConfigSchema>;
export type DeploymentConfigInput = z.input<typeof deploymentConfigSchema>;

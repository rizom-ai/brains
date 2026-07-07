/**
 * Env Schema Declarations
 *
 * The declaration shape each shell service uses to describe the env vars
 * it consumes, plus the renderer that turns declarations into the
 * varlock-flavored `.env.schema` sections operators receive. Services
 * declare vars next to the code that reads them; `@brains/core`
 * aggregates the declarations; the sync script writes the rendered
 * section into each brain's `env.schema.template`.
 */

export interface EnvVarDecl {
  name: string;
  required?: boolean;
  sensitive?: boolean;
  /** Rendered as a comment line above the variable. */
  description?: string;
}

/** The varlock header at the top of every generated `.env.schema`. */
export const ENV_SCHEMA_HEADER: string = [
  "# This env file uses @env-spec - see https://varlock.dev/env-spec for more info",
  "#",
  "# @defaultRequired=false @defaultSensitive=false",
  "# ----------",
].join("\n");

export function renderEnvSchemaSection(decls: EnvVarDecl[]): string {
  return decls.map(renderDecl).join("\n\n");
}

function renderDecl(decl: EnvVarDecl): string {
  const annotations = [
    ...(decl.required ? ["@required"] : []),
    ...(decl.sensitive ? ["@sensitive"] : []),
  ];
  return [
    ...(decl.description ? [`# ${decl.description}`] : []),
    ...(annotations.length > 0 ? [`# ${annotations.join(" ")}`] : []),
    `${decl.name}=`,
  ].join("\n");
}
